const fs = require('fs');
const path = require('path');

function check() {
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  if (!homeDir) {
    console.log('No HOME/USERPROFILE env');
    return;
  }
  const secretsPath = path.join(homeDir, '.config', 'abacusai_auth_secrets.json');
  console.log('Checking secrets at:', secretsPath);
  if (fs.existsSync(secretsPath)) {
    console.log('✅ Secrets file exists!');
    const content = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
    console.log('Keys in secrets file:', Object.keys(content));
    if (content.aws) {
      console.log('Found AWS key in secrets file! Keys under AWS:', Object.keys(content.aws));
    }
  } else {
    console.log('❌ Secrets file does not exist.');
  }
}

check();
