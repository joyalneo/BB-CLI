const generatePrettierRc = () => `
{
    "trailingComma": "es5",
    "tabWidth": 2,
    "semi": false,
    "printWidth": 120,
    "singleQuote": true,
    "arrowParens": "always"
  } 
 `

module.exports = { generateSharedFunctionPrettierRc: generatePrettierRc }
