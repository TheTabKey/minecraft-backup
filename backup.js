const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const archiver = require('archiver');

// Set up AWS credentials
AWS.config.update({
  accessKeyId: '',
  secretAccessKey: '',
  region: 'us-east-1', // Change to your desired AWS region
});

const s3 = new AWS.S3();

// Define the path to the Minecraft worlds directory
const minecraftWorldsDir = '';

// Define the S3 bucket name and folder where backups will be stored
const bucketName = '';
const backupFolder = '';

// Define the names of the folders to back up
const foldersToBackup = ['world', 'world_nether', 'world_the_end'];

// Promisify fs.readdir and fs.readFile functions for easier async/await usage
const readdirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);

// Function to zip multiple directories into a single zip file
function zipDirectories(directoryPaths, zipFilePath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
  
      output.on('close', resolve);
      archive.on('error', reject);
  
      archive.pipe(output);
  
      for (const directoryPath of directoryPaths) {
        const directoryName = path.basename(directoryPath);
        archive.directory(directoryPath, directoryName);
      }
  
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

// Function to generate a timestamp string
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
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

  // Gather the directory paths for backup
  const directoryPaths = foldersToBackup.map((folderName) =>
    path.join(minecraftWorldsDir, folderName)
  );

  // Create a timestamp for the backup
  const timestamp = getTimestamp();

  // Create the zip file name with the timestamp
  const zipFileName = `backup_${timestamp}.zip`;

  // Create the temporary zip file path
  const zipFilePath = path.join(minecraftWorldsDir, zipFileName);

  try {
    // Zip the directories into a single file
    await zipDirectories(directoryPaths, zipFilePath);
    console.log('Successfully created the backup zip file.');

    // Upload the zip file to S3
    await uploadFileToS3(zipFilePath, `${backupFolder}/${zipFileName}`);
    console.log(`Uploaded '${zipFilePath}' to S3 with key '${backupFolder}/${zipFileName}'`);

    // Delete the local zip file
    fs.unlinkSync(zipFilePath);
    console.log(`Deleted local zip file '${zipFilePath}'`);
  } catch (err) {
    console.error('Backup failed:', err);
  }
}
  
// Run the backup process
backupMinecraftWorlds()
  .then(() => console.log('Backup completed successfully.'))
  .catch((err) => console.error('Backup failed:', err));