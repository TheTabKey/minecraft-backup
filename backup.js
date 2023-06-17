const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const archiver = require('archiver');

// Set up AWS credentials
AWS.config.update({
  accessKeyId: 'YOUR_ACCESS_KEY',
  secretAccessKey: 'YOUR_SECRET_ACCESS_KEY',
  region: 'us-east-1', // Change to your desired AWS region
});

const s3 = new AWS.S3();

// Define the path to the Minecraft worlds directory
const minecraftWorldsDir = '/path/to/minecraft/worlds';

// Define the S3 bucket name and folder where backups will be stored
const bucketName = 'your-s3-bucket-name';
const backupFolder = 'minecraft-backups';

// Define the names of the folders to back up
const foldersToBackup = ['world1', 'world2', 'world3'];

// Promisify fs.readdir and fs.readFile functions for easier async/await usage
const readdirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);

// Function to zip a directory
function zipDirectory(directoryPath, zipFilePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(directoryPath, false);
    archive.finalize();
  });
}

// Function to upload a file to S3
async function uploadFileToS3(filePath, key) {
  const fileContent = await readFileAsync(filePath);

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
  };

  try {
    await s3.putObject(params).promise();
    console.log(`Uploaded '${filePath}' to S3 with key '${key}'`);
  } catch (err) {
    console.error(`Error uploading '${filePath}' to S3:`, err);
  }
}

// Function to start the backup process
async function backupMinecraftWorlds() {
  try {
    // Create the backup folder in S3 if it doesn't exist
    await s3.headObject({ Bucket: bucketName, Key: backupFolder }).promise();
    console.log(`Backup folder '${backupFolder}' already exists.`);
  } catch (err) {
    if (err.code === 'NotFound') {
      await s3.putObject({ Bucket: bucketName, Key: backupFolder }).promise();
      console.log(`Created backup folder '${backupFolder}' in S3.`);
    } else {
      console.error('Error checking backup folder in S3:', err);
      return;
    }
  }

  // Zip and upload specific Minecraft worlds directories to S3
  for (const folderName of foldersToBackup) {
    const worldDirectoryPath = path.join(minecraftWorldsDir, folderName);
    const zipFilePath = path.join(minecraftWorldsDir, `${folderName}.zip`);

    try {
      await zipDirectory(worldDirectoryPath, zipFilePath);
      await uploadFileToS3(zipFilePath, `${backupFolder}/${folderName}.zip`);

      console.log(`Uploaded '${zipFilePath}' to S3 with key '${backupFolder}/${folderName}.zip'`);

      // Remove the local zip file after uploading
      fs.unlinkSync(zipFilePath);
      console.log(`Deleted local zip file '${zipFilePath}'`);
    } catch (err) {
      console.error(`Error zipping and uploading '${worldDirectoryPath}' to S3:`, err);
    }
  }
}

// Run the backup process
backupMinecraftWorlds()
  .then(() => console.log('Backup completed successfully.'))
  .catch((err) => console.error('Backup failed:', err));
