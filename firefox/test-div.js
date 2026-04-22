const fs = require('fs');
const html = fs.readFileSync('popup.html', 'utf8');
const openDivs = (html.match(/<div(\s|>)/g) || []).length;
const closeDivs = (html.match(/<\/div>/g) || []).length;
console.log(`Open divs: ${openDivs}, Close divs: ${closeDivs}`);
