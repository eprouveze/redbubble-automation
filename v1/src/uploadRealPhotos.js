const { uploadPictureModule, getRealPhotos, generateMetadataWithChatGPT } = require('./uploadPictureModule');
require('dotenv').config();
const readline = require('readline');

async function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  const realPhotosDirectory = process.env.REAL_PHOTOS_DIR || '/path/to/real/photos';
  const debugMode = process.env.DEBUG_MODE === 'true';
  const realPhotos = await getRealPhotos(realPhotosDirectory);

  console.log(`Found ${realPhotos.length} photos to process.`);

  for (let i = 0; i < realPhotos.length; i++) {
    const photo = realPhotos[i];
    const photoPath = `${realPhotosDirectory}/${photo}`;
    
    if (debugMode) {
      console.log(`Generating metadata for ${photo}...`);
    }
    const metadata = await generateMetadataWithChatGPT(photoPath);

    const settings = {
      title: metadata.title,
      description: metadata.description,
      uploadKeywords: metadata.uploadKeywords
    };

    if (debugMode) {
      console.log(`\nMetadata for ${photo}:`);
      console.log(`Title: ${settings.title}`);
      console.log(`Description: ${settings.description}`);
      console.log(`Tags: ${settings.uploadKeywords}`);

      const confirmUpload = await askConfirmation('Do you want to upload this photo to Redbubble? (y/n): ');
      if (!confirmUpload) {
        console.log(`Skipping upload for ${photo}.`);
        continue;
      }
    }

    console.log(`\nUploading photo ${i + 1} of ${realPhotos.length}: ${photo}`);
    await uploadPictureModule(settings, photo, photoPath);
    console.log(`✓ Successfully uploaded ${photo}`);
  }

  console.log("\nAll photos have been processed.");
}

main().catch(error => {
  console.error("Error in uploading real photos:", error);
}); 