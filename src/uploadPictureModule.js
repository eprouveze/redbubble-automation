const fs = require("fs").promises;
const fsSync = require("fs");  // For synchronous operations
const exifParser = require('exif-parser');
const axios = require('axios');
const { pause } = require("./utils");
const OpenAI = require('openai');
require("dotenv").config();
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Create a logging function
function createLogger(imgName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(process.cwd(), 'logs');
  if (!fsSync.existsSync(logDir)) {
    fsSync.mkdirSync(logDir);
  }
  
  const logPath = path.join(logDir, `upload-${imgName}-${timestamp}.log`);
  const logStream = fsSync.createWriteStream(logPath, { flags: 'a' });
  
  return {
    log: (message, data = null) => {
      const timestamp = new Date().toISOString();
      const logMessage = data 
        ? `${timestamp}: ${message}\n${JSON.stringify(data, null, 2)}\n`
        : `${timestamp}: ${message}\n`;
      
      logStream.write(logMessage);
      console.log(message);
      if (data) console.log(data);
    },
    close: () => logStream.end()
  };
}

/**
 * Extract EXIF data from an image file
 * 
 * @param {string} photoPath Path to the photo file
 * @returns {object} Extracted EXIF data
 */
async function getExifData(photoPath) {
  try {
    const buffer = await fs.readFile(photoPath);
    const parser = exifParser.create(buffer);
    const result = parser.parse();
    console.log("All EXIF Tags:", result.tags); // Log all available EXIF tags
    return {
      dateTime: result.tags.DateTimeOriginal || result.tags.CreateDate,
      camera: `${result.tags.Make || 'Unknown'} ${result.tags.Model || 'Unknown'}`,
      exposureTime: result.tags.ExposureTime,
      fNumber: result.tags.FNumber,
      iso: result.tags.ISO,
      focalLength: result.tags.FocalLength,
      gpsLatitude: result.tags.GPSLatitude,
      gpsLongitude: result.tags.GPSLongitude
    };
  } catch (error) {
    console.error("Error extracting EXIF data:", error);
    return {};
  }
}

/**
 * Upload generated and enhanced picture to your redbubble account
 * 
 * @param {string} settings Picture settings determined by ChatGPT
 * @param {string} imgName Image name in /pictures/toupload 
 * @param {string} outputPath picture path
 */
async function uploadPictureModule(settings, imgName, outputPath) {
  const logger = createLogger(imgName);
  try {
    logger.log(`Starting upload process for ${imgName}`);

    const browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
      args: [
        '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"',
        "--start-maximized",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-dbus",
        "--disable-remote-fonts",
      ],
      headless: false,
      defaultViewport: null,
      userDataDir: "./user_data",
    });
    
    // Enable CDP session for monitoring
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    
    // Enable monitoring
    await client.send('Network.enable');
    await client.send('DOM.enable');
    
    // Monitor network requests
    client.on('Network.requestWillBeSent', request => {
      logger.log('Network request:', {
        url: request.request.url,
        method: request.request.method,
        timestamp: new Date().toISOString()
      });
    });

    // Monitor network responses
    client.on('Network.responseReceived', response => {
      logger.log('Network response:', {
        url: response.response.url,
        status: response.response.status,
        timestamp: new Date().toISOString()
      });
    });

    // Monitor DOM changes
    client.on('DOM.documentUpdated', () => {
      logger.log('DOM updated');
    });

    // Monitor console messages
    page.on('console', msg => {
      logger.log('Browser console:', {
        type: msg.type(),
        text: msg.text()
      });
    });

    console.log("Navigating to the upload page...");
    await page.goto("https://www.redbubble.com/portfolio/images/new?ref=dashboard", { waitUntil: "networkidle2" });

    // Start the image upload
    console.log("Starting image upload...");
    const inputElement = await page.$("#select-image-single");
    await inputElement.uploadFile(outputPath);
    logger.log("Image upload started");

    // Use Promise.all to handle upload and settings simultaneously
    await Promise.all([
      pause(false, 60), // Give time for upload
      (async (settings) => {
        // Fill in metadata while waiting
        await page.evaluate((settings) => {
          document.querySelector("#work_title_en").value = settings.title;
          document.querySelector("#work_description_en").value = settings.description;
          document.querySelector("#work_tag_field_en").value = settings.uploadKeywords;
          document.querySelector("#work_safe_for_work_true").click();
          document.querySelector("#rightsDeclaration").click();
        }, settings);
        
        // Enable all products
        await page.evaluate(() => {
          for (const element of document.getElementsByClassName("enable-all")) {
            element.click();
          }
        });
      })(settings),
    ]);

    // Handle any dialogs that might appear
    page.on('dialog', async (dialog) => {
      logger.log('Dialog appeared:', dialog.message());
      await dialog.accept();
      logger.log('Dialog accepted');
    });

    // Simple submission with adequate pauses
    await pause(true, 5, 2);
    await page.evaluate(() => {
      document.querySelector("#submit-work").click();
    });

    // Wait for navigation or timeout
    try {
      await page.waitForNavigation({ 
        timeout: 60000,
        waitUntil: 'networkidle0' 
      });
      logger.log("Submission successful!");
    } catch (error) {
      logger.log("Navigation timeout - checking if submission was successful");
      const currentUrl = await page.url();
      if (!currentUrl.includes('portfolio/images/new')) {
        logger.log("URL changed - submission appears successful");
      } else {
        throw new Error("Submission failed - still on upload page");
      }
    }

    console.log(`Upload picture of ${imgName} has been done successfully!`);

    // Move the photo to the DONE folder
    const doneDirectory = path.join(path.dirname(outputPath), "DONE");
    console.log(`Creating DONE directory at: ${doneDirectory}`);
    await fs.mkdir(doneDirectory, { recursive: true });

    const donePath = path.join(doneDirectory, imgName);
    console.log(`Moving file to: ${donePath}`);
    await fs.rename(outputPath, donePath);
    console.log(`Moved ${imgName} to DONE folder.`);

    logger.log(`Upload completed successfully for ${imgName}`);
    logger.close();
    await browser.close();
  } catch (error) {
    logger.log(`Error during upload:`, error);
    logger.close();
    throw error;
  }
}

async function getRealPhotos(directory) {
  try {
    console.log(`Reading photos from directory: ${directory}`);
    const files = await fs.readdir(directory);
    console.log(`Found ${files.length} files.`);
    return files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
}

async function generateMetadataWithChatGPT(photoPath) {
  try {
    console.log(`Generating metadata for ${photoPath}...`);
    const fileName = photoPath.split('/').pop();
    const imageBase64 = await fs.readFile(photoPath, 'base64');
    
    // Get EXIF data
    console.log("Extracting EXIF data...");
    const exifData = await getExifData(photoPath);

    const relevantExifData = {
      dateTime: exifData.dateTime,
      camera: exifData.camera,
      exposureTime: exifData.exposureTime,
      fNumber: exifData.fNumber,
      iso: exifData.iso,
      focalLength: exifData.focalLength,
      gpsLatitude: exifData.gpsLatitude,
      gpsLongitude: exifData.gpsLongitude
    };
    
    console.log("EXIF data extracted:", relevantExifData);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional art curator and photographer marketer. Analyze the image and its EXIF metadata to create engaging, SEO-friendly metadata for Redbubble. Include relevant technical details when they enhance the description. Always respond in valid JSON format without any markdown or code block formatting."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Generate metadata for this photograph. Consider the technical details from the EXIF data to enrich the description and tags.

The metadata should follow this JSON format:
{
  "title": "string (engaging, descriptive title)",
  "description": "string (around 100 words, incorporate relevant technical details like camera settings, location, or timing when they add value)",
  "tags": ["tag1", "tag2", ... ] (15-20 relevant tags, including both subject matter and relevant photography technique tags)
}

EXIF Data for context: ${JSON.stringify(relevantExifData, null, 2)}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    let rawResponse = completion.choices[0].message.content;
    console.log("\nRaw GPT Response:", rawResponse);

    // Remove any markdown code block formatting
    rawResponse = rawResponse.replace(/```json|```/g, '').trim();

    let response;
    try {
      response = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error("\nError parsing GPT response:", parseError);
      console.log("Raw response that couldn't be parsed:", rawResponse);
      throw new Error("Failed to parse GPT response as JSON");
    }
    
    if (!response.title || !response.description || !response.tags) {
      console.error("\nInvalid response format from GPT:", response);
      throw new Error("Invalid response format from GPT - missing required fields");
    }

    console.log("Metadata generated successfully.");
    return {
      title: response.title,
      description: response.description,
      uploadKeywords: response.tags.join(', ')
    };
  } catch (error) {
    console.error("\nError generating metadata:", error);
    if (error.response) {
      console.error("OpenAI API Error Details:", error.response.data);
    }
    throw error;
  }
}

module.exports = {
  uploadPictureModule,
  getRealPhotos,
  generateMetadataWithChatGPT,
};
