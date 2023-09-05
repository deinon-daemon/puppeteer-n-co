const axios = require('axios');
const queryString = require('querystring');

function toss_coin() {
  const coinToss = Math.floor(Math.random() * 2) + 1;

  // Select key based on toss
  let apiKey;
  if(coinToss === 1) {
    apiKey = process.env.SCRAPFLY_KEY;
  } else {
    apiKey = process.env.SCRAPFLY_KEY_2;
  }
  return apiKey
}

async function scrapeText(url) {
  const key = toss_coin();
  const encoded_url = queryString.stringify({url});
  console.log('encoded_url', encoded_url);
  const text_url = 'https://api.scrapfly.io/scrape?key='+ key + '&' + encoded_url + `&tags=project%3Adefault%2Craven&proxy_pool=public_residential_pool&debug=false&country=us&asp=true&render_js=true&rendering_wait=2000&js=cmV0dXJuIGRvY3VtZW50LmJvZHkuaW5uZXJUZXh0Ow==&auto_scroll=true`
  try {

    const response = await axios.get(text_url);
    const eval = response.data.result.browser_data.javascript_evaluation_result;
    //console.log('the eval is', JSON.stringify(eval));
    return eval

  } catch (error) {

    console.log('big ol scrapfly error for text collection');
    return null

  }

}

async function scrapeLinks(url) {
  const key = toss_coin();
  const encoded_url = queryString.stringify({url});
  console.log('encoded_url for link discovery', encoded_url);
  const links_url = 'https://api.scrapfly.io/scrape?key=' + key + '&' + encoded_url + `&tags=project%3Adefault%2Craven&proxy_pool=public_residential_pool&debug=false&country=us&asp=true&render_js=true&rendering_wait=2000&js=cmV0dXJuIEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYScpKS5tYXAobGluayA9PiBsaW5rLmhyZWYpOw&auto_scroll=true`
  try {

    const response = await axios.get(links_url);
    const eval = response.data.result.browser_data.javascript_evaluation_result;
    //console.log('the eval is', JSON.stringify(eval));
    return eval

  } catch (error) {

    console.log('big ol scrapfly error for link discovery');
    return null

  }

}

module.exports = {
  scrapeText,
  scrapeLinks
}