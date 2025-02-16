const { exec } = require('child_process');

const port = 3001;

const platform = process.platform;
const command = platform === 'win32' 
  ? `netstat -ano | findstr :${port} && FOR /F "tokens=5" %a in ('netstat -ano | findstr :${port}') do taskkill /F /PID %a`
  : `lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.log(`No process found on port ${port}`);
    return;
  }
  console.log(`Port ${port} cleared`);
}); 