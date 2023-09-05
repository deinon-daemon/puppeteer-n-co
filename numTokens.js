function numTokensFromString(text) {
  if (typeof text !== 'string') {
    return 0
  }
  let tokens = text.split(' ');
  let numTokens = 0;
  for (let token of tokens) {
    if (token.startsWith('##')) {
      numTokens++;
    } else if (token.includes('#') || token.includes('@')) {
      numTokens++;
    } else if (token.length > 0 && !token.match(/^[a-z0-9]*$/i)) {
      for (let i = 0; i < token.length; i++) {
        if (!token[i].match(/[a-z0-9]/i)) {
          numTokens++;
          i++;
          while (i < token.length && !token[i].match(/[a-z0-9]/i)) {
            i++;
          }
        }
      }
    } else {
      numTokens++;
    }
  }
  return numTokens;
}

module.exports = { numTokensFromString };