const fs = require("fs").promises;
const fsSync = require("fs"); // For synchronous operations
const exifParser = require('exif-parser');
const { pause } = require("./utils");
const OpenAI = require('openai');
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const constants = require("./constants");
const logger = require("./logger");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Add Stealth plugin
puppeteer.use(StealthPlugin());

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
    logger.info("EXIF Tags extracted", { tags: result.tags });
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
    logger.error("Error extracting EXIF data", { error });
    return {};
  }
}

/**
 * Generate metadata using OpenAI's GPT model
 * 
 * @param {string} photoPath Path to the photo file
 * @returns {object} Metadata containing title, description, and tags
 */
async function generateMetadataWithChatGPT(photoPath) {
  try {
    logger.info(`Generating metadata for ${photoPath}...`);
    const fileName = path.basename(photoPath);
    const imageBase64 = await fs.readFile(photoPath, 'base64');
    
    // Get EXIF data
    logger.info("Extracting EXIF data...");
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
    
    logger.info("EXIF data extracted:", relevantExifData);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
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
    logger.info("Raw GPT Response:", rawResponse);

    // Remove any markdown code block formatting
    rawResponse = rawResponse.replace(/```json|```/g, '').trim();

    let response;
    try {
      response = JSON.parse(rawResponse);
    } catch (parseError) {
      logger.error("Error parsing GPT response:", { parseError, rawResponse });
      throw new Error("Failed to parse GPT response as JSON");
    }
    
    if (!response.title || !response.description || !response.tags) {
      logger.error("Invalid response format from GPT:", { response });
      throw new Error("Invalid response format from GPT - missing required fields");
    }

    logger.info("Metadata generated successfully.");
    return {
      title: response.title,
      description: response.description,
      uploadKeywords: response.tags.join(', ')
    };
  } catch (error) {
    logger.error("Error generating metadata:", { error });
    if (error.response) {
      logger.error("OpenAI API Error Details:", error.response.data);
    }
    throw error;
  }
}

/**
 * Create a logger instance with Winston
 * 
 * @param {string} imgName Image name to associate with logs
 * @returns {object} Logger instance
 */
function createLoggerInstance(imgName) {
  // Using the separate logger module
  // Add imgName as a metadata field
  return logger.child({ imgName });
}

/**
 * Upload generated and enhanced picture to your Redbubble account
 * 
 * @param {object} settings Picture settings determined by ChatGPT
 * @param {string} imgName Image name in /pictures/toupload 
 * @param {string} outputPath Picture path
 */
async function uploadPictureModule(settings, imgName, outputPath) {
  const loggerInstance = createLoggerInstance(imgName);
  let browser;
  try {
    loggerInstance.info(`Starting upload process for ${imgName}`);

    browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
      args: [
        `--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"`,
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
      headless: true, // Changed to headless for performance
      defaultViewport: null,
      userDataDir: constants.paths.userDataDir,
    });

    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

    // Enable monitoring
    await client.send('Network.enable');
    await client.send('DOM.enable');

    // Monitor network requests
    client.on('Network.requestWillBeSent', request => {
      loggerInstance.info('Network request', {
        url: request.request.url,
        method: request.request.method,
        timestamp: new Date().toISOString()
      });
    });

    // Monitor network responses
    client.on('Network.responseReceived', response => {
      loggerInstance.info('Network response', {
        url: response.response.url,
        status: response.response.status,
        timestamp: new Date().toISOString()
      });
    });

    // Monitor DOM changes
    client.on('DOM.documentUpdated', () => {
      loggerInstance.info('DOM updated');
    });

    // Monitor console messages
    page.on('console', msg => {
      loggerInstance.info('Browser console', {
        type: msg.type(),
        text: msg.text()
      });
    });

    loggerInstance.info("Navigating to the upload page...");
    await page.goto(constants.urls.upload, { waitUntil: "networkidle2" });

    // Start the image upload
    loggerInstance.info("Starting image upload...");
    const inputElement = await page.$(constants.selectors.uploadButton);
    await inputElement.uploadFile(outputPath);
    loggerInstance.info("Image upload started");

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
      loggerInstance.info('Dialog appeared', { message: dialog.message() });
      await dialog.accept();
      loggerInstance.info('Dialog accepted');
    });

    // Simple submission with adequate pauses
    loggerInstance.info("Attempting submission...");
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
      loggerInstance.info("Submission successful!");
    } catch (error) {
      loggerInstance.info("Navigation timeout - checking if submission was successful");
      const currentUrl = await page.url();
      if (!currentUrl.includes('portfolio/images/new')) {
        loggerInstance.info("URL changed - submission appears successful");
      } else {
        throw new Error("Submission failed - still on upload page");
      }
    }

    loggerInstance.info(`Upload picture of ${imgName} has been done successfully!`);

    // Move the photo to the DONE folder
    const doneDirectory = path.join(path.dirname(outputPath), constants.paths.doneDir);
    loggerInstance.info(`Creating DONE directory at: ${doneDirectory}`);
    await fs.mkdir(doneDirectory, { recursive: true });

    const donePath = path.join(doneDirectory, imgName);
    loggerInstance.info(`Moving file to: ${donePath}`);
    await fs.rename(outputPath, donePath);
    loggerInstance.info(`Moved ${imgName} to DONE folder.`);

    loggerInstance.info(`Upload completed successfully for ${imgName}`);
    await browser.close();
  } catch (error) {
    loggerInstance.error(`Error during upload:`, { error });
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        loggerInstance.error(`Error closing browser:`, { closeError });
      }
    }
    throw error;
  }
}

async function getRealPhotos(directory) {
  try {
    logger.info(`Reading photos from directory: ${directory}`);
    const files = await fs.readdir(directory);
    logger.info(`Found ${files.length} files.`);
    return files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
  } catch (error) {
    logger.error("Error reading directory:", { error });
    return [];
  }
}

module.exports = {
  uploadPictureModule,
  getRealPhotos,
  generateMetadataWithChatGPT, // Ensure this function is properly implemented and exported
}; 