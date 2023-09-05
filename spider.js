const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
//const { numTokensFromString } = require("./numTokens.js");
const { scrapeText, scrapeLinks } = require("./scrapflySavesTheDay.js");
const sanitizeHtml = require('sanitize-html');
const Url = require('url');

process.setMaxListeners(100); 

function filterLinks(links, url) {
  return links
    .map(link => Url.resolve(url, link))
    .filter(link =>
      link.startsWith(url) &&
      !link.includes('#') &&
      !link.endsWith('.pdf') &&
      !link.endsWith('.doc')
    );
}

// opportunistic link discovery function
async function checkLinks(links, url) {
  const bestSubpaths = [
    "/contact",
    "/about",
    "/resources",
    "/programs"
  ];
  const sitemapSubpaths = [
    "/news",
    "/events",
    "/jobs",
    "/apply",
    "/join",
    "/team",
    "/partners",
    "/services",
    "/products",
    "/solutions",
    "/careers",
    "/blog",
    "/faq",
    "/press",
  ];
  let best = {};
  let ordered = {};

  const resolvedLinks = filterLinks(links, url);
  //console.log('resolvedLinks: ', resolvedLinks);

  const trimmedLinks = resolvedLinks.map(string => {
    if (string[string.length - 1] === '/') {
      return string.slice(0, -1);
    }
    return string;
  });

  //console.log('trimmedLinks scrapfly: ', trimmedLinks);

  for (let link of trimmedLinks) {
    bestSubpaths.some(path => new URL(link).pathname.startsWith(path))
      ? best[link] = link
      : sitemapSubpaths.some(path => new URL(link).pathname.startsWith(path) ||
                                    new URL(link).pathname.endsWith(path))
        ? ordered[link] = link
        : null
  }

  let allLinks = [
    ...Object.values(best),
    ...Object.values(ordered)
  ];

  // Filter out duplicates and flatten
  allLinks = [...allLinks, ...new Set(trimmedLinks)]

  return [...new Set(allLinks)];
}

// much simpler, used for a fresh start as a backup method
async function backupSpider(url) {
  let results = '';
  let visitedLinks = new Set();
  let all_links = [];
  let newLinks = [];
  const useful_regex = /<[^>]*>|{[^}]*}|[^<]*\[[^]]*]/g;

  if (!url.startsWith('http') || !url.includes('http')) {
    url = `https://${url}`;
  }
  try {
    let someLinks = await scrapeLinks(url);
    if (!someLinks) {
      return null
    }
    all_links.push(...Array.from(someLinks));
    newLinks = await checkLinks(someLinks, url);
    const sitemap = [url, ...newLinks];

    for (let link of sitemap) {
      try {
        let scrapfly_blob = await scrapeText(link);
        let scrapfly_words = scrapfly_blob.replace('/\n/','  ').split(/\s+/);
        let scrap_filteredWords = scrapfly_words.filter(w => w.length < 30 && /^[\x00-\x7F]+$/.test(w));
        let some_text = scrap_filteredWords.join(' ');
        var scrapfly_text = sanitizeHtml(some_text).replace(useful_regex, '');
        if (scrapfly_text.length > 10000) {
          scrapfly_text = scrapfly_text.slice(0,9999);
        }
        results += scrapfly_text;
      } catch(error) {
        console.log(`error on asp/js scrape client for url: ${link} ...`, error);
        break
      }
      visitedLinks.add(link);
      if (visitedLinks.size > 4) {
          break;
      }
    } 

  } catch(error) {
    console.log('spydering w/ scrapfly asp failed for: ', url)
    let blob = await scrapeText(url);
    let words = blob.replace('/\n/','  ').split(/\s+/);
    let filteredWords = words.filter(w => w.length < 30 && /^[\x00-\x7F]+$/.test(w));
    let a_text = filteredWords.join(' ');
    var last_text = sanitizeHtml(a_text).replace(useful_regex, '');
    if (last_text.length > 10000) {
      last_text = last_text.slice(0,9999);
    }
    results += last_text;
  }

  return {
    url: url,
    text: results,
    visited_links: Array.from([...visitedLinks]),
    subdomains: Array.from(newLinks),
    all_links: Array.from([...new Set(all_links)])
  }

}

async function spiderWebpage(url) {
  // declare our outRecord json fields as their defaults
  let results = '';
  let visitedLinks = new Set();
  let all_links = [];
  let newLinks = new Set();
  //const useful_regex = /<[^>]*>|{[^}]*}|[^<]*\[[^]]*]/g;
  //let domainStatus = "Active";


  // config puppeteer chromium to utilize stealth methods (optimized for chrome) & adblocking
  puppeteer.use(StealthPlugin());
  //const proxy = `http://${username}:${password}@${proxyServer}`;
  //const anonymizedProxy = await proxyChain.anonymizeProxy(proxy);


  // used to scrape all pages we snowball / discover
  async function scrapePage(page) {

    const extractedText = await page.$eval('*', (el) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNode(el);
      selection.removeAllRanges();
      selection.addRange(range);
      return window.getSelection().toString();
    });

    const words = extractedText.split(/\s+/);
    const filteredWords = words.filter(w => w.length < 30 && /^[\x00-\x7F]+$/.test(w));
    var text = filteredWords.join(' ');

    if (!text || text.length < 200 || text.startsWith('Error') || text.includes('Ray ID:')) {
      console.log(`TEXT TOO SPARSE -- puppeteer can't hack it`);
      throw new Error(`TEXT TOO SPARSE -- puppeteer can't hack it`);

    } 
    results += text;
  }

  // opportunistic link discovery function
  async function getLinks(page) {
    const bestSubpaths = [
      "/contact",
      "/about",
      "/resources",
      "/programs"
    ];
    const sitemapSubpaths = [
      "/news",
      "/events",
      "/jobs",
      "/apply",
      "/join",
      "/team",
      "/partners",
      "/services",
      "/products",
      "/solutions",
      "/careers",
      "/blog",
      "/faq",
      "/press",
    ];
    let best = {};
    let ordered = {};

    const links = await page.$$eval('a', (anchors) => {
      //console.log(anchors);  // Print anchors to console
      if (!anchors || !anchors.map) {
        console.log('Anchor selector returned no elements!');
        return [];  
      }
      return anchors.map(a => a.href);
    });

    //console.log('links: ', links);

    const resolvedLinks = filterLinks(links, page.url());

    const trimmedLinks = resolvedLinks.map(string => {
      if (string[string.length - 1] === '/') {
        return string.slice(0, -1);
      }
      return string;
    });

    //console.log('trimmedLinks puppeteer: ', trimmedLinks);

    all_links.push(...Array.from(trimmedLinks));
    for (let link of trimmedLinks) {
      bestSubpaths.some(path => new URL(link).pathname.startsWith(path))
        ? best[link] = link
        : sitemapSubpaths.some(path => new URL(link).pathname.startsWith(path) ||
                                      new URL(link).pathname.endsWith(path))
          ? ordered[link] = link
          : null
    }

    let allLinks = [
      ...Object.values(best),
      ...Object.values(ordered)
    ];

    // Filter out duplicates and flatten
    allLinks = [...allLinks, ...new Set(trimmedLinks)]

    return [...new Set(allLinks)];
  }

  if (!url.startsWith('http') || !url.includes('http')) {
    url = `https://${url}`;
  }

  console.log(`Scraping ${url}`);
  visitedLinks.add(url);

  // launch browser session and set a dummy user agent to avoid any cookies tricks or cloudfare fingerprinting
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    ignoreHTTPSErrors: true
  });

  const context = await browser.createIncognitoBrowserContext({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
    ],
  ignoreHTTPSErrors: true,  
  timeout: 60000
  });

  try {
    const page = await context.newPage();
    await page.setDefaultNavigationTimeout(0);
    await page.setViewport({ width: 1680, height: 1050 });
    await page.goto(url, {
      waitUntil: [
        'domcontentloaded'
        //'networkidle0',
        //'load'
      ] 
    });
    await scrapePage(page);

    try {
      newLinks = await getLinks(page);
      for (let link of newLinks) {
        await page.goto(link, {
          waitUntil: [
            'domcontentloaded' 
            //'networkidle0',
            //'load'
          ] 
        });
        await scrapePage(page);
        visitedLinks.add(link);
        if (visitedLinks.size > 7) {
            break;
        }
      }

      return {
          url: url,
          text: results,
          visited_links: Array.from([...visitedLinks]),
          subdomains: Array.from(newLinks),
          all_links: Array.from([...new Set(all_links)])
      }
    } catch(error) {
      console.error(error);
      domainStatus = "subdomains unstable";

      return {
        url: url,
        text: results,
        visited_links: Array.from([...visitedLinks]),
        subdomains: Array.from(newLinks),
        all_links: Array.from([...new Set(all_links)])
      }
    }
  } catch(error) {
    console.log("POSSIBLE BAD DOMAIN", url);
    domainStatus = "root domain error";

    return {
        url: url,
        text: results,
        visited_links: Array.from([...visitedLinks]),
        subdomains: Array.from(newLinks),
        all_links: Array.from([...new Set(all_links)])
    }
  } finally {
    console.log('spinning down');
    await context.close();
  }
}

// used for removing pesky substrings recusively
function recursiveReplace(text, search_str) {
  if (text.includes(search_str)) {
      return recursiveReplace(text.replace(search_str, ''), search_str);
  } else {
      return text;
  }
}




module.exports = { spiderWebpage, backupSpider, filterLinks };
