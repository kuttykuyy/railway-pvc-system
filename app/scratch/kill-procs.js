const { execSync } = require('child_process');

try {
  const output = execSync('wmic process where "name=\'node.exe\'" get ProcessID, CommandLine').toString();
  const lines = output.split('\n');
  
  console.log('Scanning Node processes:');
  for (const line of lines) {
    if (line.includes('88_-_Rice_Valuation_App_Development') || line.includes('railway_pvc_system')) {
      const match = line.trim().match(/(\d+)\s*$/);
      if (match) {
        const pid = match[1];
        console.log(`Killing process ${pid}: ${line.trim().substring(0, 100)}...`);
        try {
          process.kill(parseInt(pid), 'SIGKILL');
          console.log(`Successfully killed process ${pid}`);
        } catch (e) {
          console.error(`Failed to kill process ${pid}: ${e.message}`);
        }
      }
    }
  }
} catch (err) {
  console.error('Error scanning/killing processes:', err.message);
}
