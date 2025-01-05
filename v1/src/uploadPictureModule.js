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
  
  // Log startup
  const startupMessage = `\n=== Starting new upload session for ${imgName} at ${timestamp} ===\n`;
  logStream.write(startupMessage);
  console.log(startupMessage);
  
  return {
    log: (message, data = null) => {
      const timestamp = new Date().toISOString();
      const logMessage = data 
        ? `${timestamp}: ${message}\n${JSON.stringify(data, null, 2)}\n`
        : `${timestamp}: ${message}\n`;
      
      // Write to file and console
      logStream.write(logMessage);
      console.log(message);
      if (data) console.log(data);
    },
    close: () => {
      const endMessage = '\n=== Upload session ended ===\n';
      logStream.write(endMessage);
      console.log(endMessage);
      logStream.end();
    }
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
    
    const debugMode = process.env.DEBUG_MODE === 'true';
    if (debugMode) {
      console.log("All EXIF Tags:", result.tags);
    }
    
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
  logger.log('Starting upload process...');
  logger.log(`Debug mode: ${process.env.DEBUG_MODE}`);
  
  try {
    const debugMode = process.env.DEBUG_MODE === 'true';
    logger.log('Attempting to connect to Chrome...');
    
    let browser;
    try {
      // Try to connect to existing Chrome instance
      logger.log('Attempting to connect to Chrome with 5 second timeout...');
      const connectPromise = puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null
      });
      
      browser = await Promise.race([
        connectPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000)
        )
      ]);
      
      logger.log('Successfully connected to Chrome');
    } catch (e) {
      logger.log('No Chrome instance found running with remote debugging. Please start Chrome with remote debugging enabled:');
      logger.log('Mac: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
      logger.log('Connection error:', e);
      throw new Error('Chrome must be running with remote debugging enabled on port 9222');
    }
    
    // Try to find an existing tab with the upload page
    logger.log('Getting list of open tabs using CDP...');
    let page;
    try {
      // Create CDP session
      const client = await browser.target().createCDPSession();
      const targets = await client.send('Target.getTargets');
      logger.log(`Found ${targets.targetInfos.length} targets`);

      // First try to find an existing Redbubble tab (any Redbubble page)
      const redbubbleTarget = targets.targetInfos.find(target => 
        target.type === 'page' && target.url.includes('redbubble.com')
      );

      if (redbubbleTarget) {
        logger.log('Found existing Redbubble tab');
        page = await browser.newPage({ targetId: redbubbleTarget.targetId });
      } else {
        logger.log('No Redbubble tab found, creating new page');
        page = await browser.newPage();
      }

      // Always navigate to the upload page, regardless of current URL
      logger.log('Navigating to upload page...');
      await page.goto("https://www.redbubble.com/portfolio/images/new?ref=dashboard", { 
        waitUntil: "networkidle2",
        timeout: 30000
      });

    } catch (e) {
      logger.log('Error getting/creating page:', e);
      throw e;
    }
    
    // Wait a moment for the page to be fully active
    await new Promise(resolve => setTimeout(resolve, 1000));
    logger.log('Page should be ready for interaction');
    
    const client = await page.target().createCDPSession();
    
    // Only enable detailed monitoring in debug mode
    if (debugMode) {
      await client.send('Network.enable');
      await client.send('DOM.enable');
      
      client.on('Network.requestWillBeSent', request => {
        logger.log('Network request:', {
          url: request.request.url,
          method: request.request.method,
          timestamp: new Date().toISOString()
        });
      });

      client.on('Network.responseReceived', response => {
        logger.log('Network response:', {
          url: response.response.url,
          status: response.response.status,
          timestamp: new Date().toISOString()
        });
      });

      client.on('DOM.documentUpdated', () => {
        logger.log('DOM updated');
      });

      page.on('console', msg => {
        logger.log('Browser console:', {
          type: msg.type(),
          text: msg.text()
        });
      });
    }

    // Check if we need to login
    const isLoginPage = await page.$('a[data-testid="ds-header-login-action"]') !== null;
    if (isLoginPage) {
      logger.log('Not logged in. Please log into Redbubble manually in the Chrome window with remote debugging enabled.');
      throw new Error('Authentication required. Please log in manually first.');
    }

    // Check if we're on the right page
    const uploadButton = await page.$("#select-image-single");
    if (!uploadButton) {
      logger.log('Not on the correct upload page. Please ensure you are logged in and can access: https://www.redbubble.com/portfolio/images/new?ref=dashboard');
      throw new Error('Could not find upload button. Please verify login status and permissions.');
    }

    const inputElement = await page.$("#select-image-single");
    await inputElement.uploadFile(outputPath);
    if (debugMode) {
      logger.log("Image upload started");
    }

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
        timeout: 30000,
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
    
    // Close only this page's CDP session, not the browser
    if (client) {
      await client.detach();
    }
    // Close only this page, leaving the browser open for next upload
    await page.close();
    
    logger.close();
  } catch (error) {
    logger.log(`Error during upload:`, error);
    logger.close();
    throw error;
  }
}

async function getRealPhotos(directory) {
  try {
    const files = await fs.readdir(directory);
    return files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
}

async function generateMetadataWithChatGPT(photoPath) {
  try {
    const fileName = photoPath.split('/').pop();
    const imageBase64 = await fs.readFile(photoPath, 'base64');
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
              text: `Generate metadata for this photograph. Consider the technical details from the EXIF data to enrich the tags but not the description.

The metadata should follow this JSON format:
{
  "title": "string (engaging, descriptive title)",
  "description": "string (around 100 words, do not mention technical details from the image EXIF such as camera type, but if you have location information you may use it)",
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
    
    let response;
    try {
      response = JSON.parse(rawResponse.replace(/```json|```/g, '').trim());
    } catch (parseError) {
      console.error("\nError parsing GPT response:", parseError);
      throw new Error("Failed to parse GPT response as JSON");
    }
    
    if (!response.title || !response.description || !response.tags) {
      console.error("\nInvalid response format from GPT:", response);
      throw new Error("Invalid response format from GPT - missing required fields");
    }

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
