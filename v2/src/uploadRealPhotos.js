const { uploadPictureModule, getRealPhotos, generateMetadataWithChatGPT } = require('./uploadPictureModule');
require('dotenv').config();
const readline = require('readline');
const path = require('path');
const logger = require('./logger');
const constants = require('./constants');

/**
 * Prompt the user for confirmation
 * 
 * @param {string} question The question to ask the user
 * @returns {boolean} True if the user confirms, false otherwise
 */
async function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * Main function to process and upload real photos to Redbubble
 */
async function main() {
  const realPhotosDirectory = process.env.REAL_PHOTOS_DIR || path.join(__dirname, '..', 'pictures', 'toupload');
  const debugMode = process.env.DEBUG_MODE === 'true';
  const realPhotos = await getRealPhotos(realPhotosDirectory);

  if (realPhotos.length === 0) {
    logger.info("No photos found to upload.");
    return;
  }

  logger.info(`Found ${realPhotos.length} photos to process.`);

  for (let i = 0; i < realPhotos.length; i++) {
    const photo = realPhotos[i];
    const photoPath = path.join(realPhotosDirectory, photo);
    logger.info(`Processing photo ${i + 1} of ${realPhotos.length}: ${photo}`);

    try {
      const metadata = await generateMetadataWithChatGPT(photoPath);

      const settings = {
        title: metadata.title,
        description: metadata.description,
        uploadKeywords: metadata.uploadKeywords
      };

      if (debugMode) {
        logger.info(`Debugging Info for ${photo}:`, settings);

        const confirmUpload = await askConfirmation('Do you want to upload this photo to Redbubble? (y/n): ');
        if (!confirmUpload) {
          logger.info(`Skipping upload for ${photo}.`);
          continue;
        }
      }

      await uploadPictureModule(settings, photo, photoPath);
      logger.info(`Successfully uploaded ${photo} to Redbubble.`);
    } catch (error) {
      logger.error(`Failed to upload ${photo}:`, { error });
      // Optionally, move to a FAILED folder or handle as needed
    }
  }

  logger.info("All photos have been processed.");
}

main().catch(error => {
  logger.error("Error in uploading real photos:", { error });
}); 