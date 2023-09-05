const functions = require('@google-cloud/functions-framework');
const { spiderWebpage, backupSpider } = require("./spider.js");
const { createClient } =  require('@supabase/supabase-js');
const { numTokensFromString } = require("./numTokens.js");
const {Storage} = require('@google-cloud/storage');
const axios = require('axios');

if (!supabase_url || !supabase_key) throw new Error("RESPECTFULLY MY DUDE, UR SUPABASE CREDS ARENT THERE!");
const supabase = createClient(supabase_url, supabase_key);

let gcs;

// help prevent Memory Leakage by increasing MaxListeners for concurrent scraping
process.setMaxListeners(100); 

functions.http('asyncSpider', async (req, res) => {
  // everything commented out below remains "archived" here because we may want to 
  // retrieve & cache copies of scraped data w/o synthesizing them via raven-megabyte-ml. 
  // for now, all uses of this scraper relate to ravenML, so the caching becomes duplicative and thus inefficient -bcarsley 07/03/23

  const start_url = req.query.url;
  let url;
  if (!start_url.startsWith('http')) {
    url = `https://${start_url}`;
  } else {
    url = start_url;
  }

  const snapshotsBucket = "puppeteer-cache";
  let unit = {
    text: '',
    subdomains: [],
    visited_links: Array.from([url]),
    all_links: Array.from([url])
  };
  let status_val = 'root domain error';
  const table = req.query.table ?? 'puppeteers_table';
  try {
    unit = await spiderWebpage(url || "https://huggingface.co/tiiuae/falcon-40b");
    if (!unit || unit.visited_links.length < 2) {
      console.log('standard spider no good, using backup spider w/ asp');
      throw new Error('puppeteer-base cant hack it');
      
    }
    status_val = 'Active';

  } catch(error) {
    console.log('standard spider no good, using backup spider w/ asp ... error thrown: ', error);
    try {
        unit = await backupSpider(url);
        if (!unit || unit.visited_links.length < 1) {
          console.log("even the backup spider's no good, moving to internet archive waybackup scraper...");
          throw new Error('scrapfly cant hack it either');
        }  
        status_val = 'Active';

    } catch(error) {
      console.log('backup asp scrapfly is either overloaded or cant hack it: ', url);
      console.log('backup puppeteer engaged...');
      if (!url.startsWith('http')) {
          url = `https://${url}`;
      }
      try {
        const res = await axios.post('https://us-central1-'+project+'.cloudfunctions.net/sa-scraper-v2?url='+url);
        const text = res.data.text;
        unit = {
          text,
          subdomains: [],
          visited_links: Array.from([url]),
          all_links: Array.from([url])
        }  
        status_val = 'Active';
      } catch(error) {
        console.log('backup puppeteer is either overloaded or cant hack it: ', url);
        try {
          url = url.split('/').slice(0, -1).join('/');
          console.log('new url clipped: ', url);
          const res = await axios.post('https://us-central1-'+project+'.cloudfunctions.net/zen-scraper-test', {url: url});
          const zen_data = res.data;
          const zen_text = zen_data.text;
          const subpaths = Array.from(zen_data.links.filter(link =>
            link.startsWith(url) &&
            !link.includes('#') &&
            !link.endsWith('.pdf') &&
            !link.endsWith('.doc')
          ));
          unit = {
            text: zen_text,
            subdomains: subpaths,
            visited_links: Array.from([url]),
            all_links: Array.from(zen_data.links)
          }
          status_val = 'Active';

        } catch(error) {
          console.log('zen rows cant hack it either...', error);
          try {
            console.log('last chance! wayback time!')
            const res = await axios.post('https://us-central1-'+project+'.cloudfunctions.net/wayback-archive', {url: url});
            unit = res.data;
            status_val = 'Active';

          } catch(error) {
            console.log('wayback cant hack it, exiting ...', error);
            unit = {
              text: '',
              subdomains: [],
              visited_links: Array.from([url]),
              all_links: Array.from([url])
            };
            status_val = 'root domain error';
          }
        }  
      }
    
    }
  }  
  const id = generateUniqueID();

  if ((unit.text ?? '').length < 100) {
    status_val = 'root domain error';
  }
  if ((unit.text ?? '').length > 100 && (unit.text ?? '').length < 500) {
    status_val = 'needs review';
  }

  const outputRecord = {
    id,
    ...unit,
    num_tokens: numTokensFromString((unit.text ?? '')),
    domain: new URL(url).protocol + "//" + new URL(url).hostname,
    status: status_val
  }

  const {supa_error} = await supabase
    .from(table)
    .update({
      secondary_id: outputRecord.id,
      text: outputRecord.text,
      subdomains: outputRecord.subdomains,
      visited_links: outputRecord.visited_links,
      all_links: outputRecord.all_links,
      status: outputRecord.status,
      domain: outputRecord.domain,
      num_tokens: outputRecord.num_tokens,
    })
    .eq('url', start_url);

  if (supa_error) {
    console.log(supa_error);
  }
  // Stringify the object to JSON
  //const jsonRecord = JSON.stringify(outRecord);

  res.status(200).send(outputRecord)

  
  



  //const fileOptions = createUploadOptions('application/json', unit.mainURL);
  //const UrlObject = new URL(unit.mainURL);
  //const subDirName = `${UrlObject.hostname}`;
  //const fileName = `${UrlObject.hostname}-${UrlObject.pathname.replaceAll('/','') ?? 'home'}-${dateString}.json`;


  

  //console.log('JSON RECORD:', jsonRecord);
  
  //await writeToGcs(snapshotsBucket, subDirName, fileName, jsonRecord, fileOptions);

});

function generateUniqueID() {
    // Initialize User ID system
    let count = Math.floor(Math.random() * 4) + 1;
    const randomPart = Math.random().toString(36).substring(2, 9);
    const rand_id = randomPart + count++;
    return rand_id;
  }

async function writeToGcs(bucketName, subdirName, filename, content, options) {
    gcs = new Storage();
    const bucket = gcs.bucket(bucketName);
    const file = bucket.file(subdirName + '/' + filename);
    const gcs_filename = `gs://${bucket.name}/${subdirName}/${file.name}`

    const stream = file.createWriteStream(options);
    return new Promise((resolve, reject) => {
      stream.end(content);
      stream.on('error', (err) => {
        console.error('Error writing GCS file: ' + err);
        reject(err);
      });
      stream.on('finish', () => {
        console.log('Created object: '+gcs_filename);
        resolve(200);
      });
    });
  }

  function createUploadOptions(contentType, url) {
    return {
      resumable: false,
      metadata: {
        contentType: contentType,
        metadata: {
          pageUrl: url,
        }
      }
    };
  }