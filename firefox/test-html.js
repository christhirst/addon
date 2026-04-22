const fs = require('fs');
const html = fs.readFileSync('popup.html', 'utf8');
if (html.includes('id="auto-click-help"')) {
    console.log("ID found.");
} else {
    console.log("ID NOT found!");
}
