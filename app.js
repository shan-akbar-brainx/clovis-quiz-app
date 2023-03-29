const fs = require('fs');
const puppeteer = require('puppeteer');
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const fetch = require('node-fetch');
const DomParser = require('dom-parser');
const sgMail = require('@sendgrid/mail');

const PORT = 3000;
require('dotenv').config();

let pdf_1_saved = false;
let pdf_2_saved = false;

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));

app.use(express.static('public'));

async function html_to_pdf(filename, pdfName){

const browser = await puppeteer.launch();
// Create a new page
const page = await browser.newPage();

// Website URL to export as pdf
const website_url = "http://localhost:3000/" + filename;

// Open URL in current page
await page.goto(website_url, { waitUntil: 'networkidle0' });

//To reflect CSS used for screens instead of print
await page.emulateMediaType('screen');

// Downlaod the PDF
const pdf = await page.pdf({
    path:  pdfName + '.pdf',
    margin: { top: '100px', right: '50px', bottom: '100px', left: '50px' },
    printBackground: true,
    format: 'A3',
  });
  if(pdfName == "your_custom_recommendations"){
    pdf_1_saved = true;
  }
  if(pdfName == "your_custom_macros"){
    pdf_2_saved = true;
  }
  await browser.close();
}

app.post('/composePlan', (req, res)=> {
  let data = req.body;
  let userAnswers = JSON.parse(data.userAnswers);
  let quizResults = JSON.parse(data.quizResults);
  let themeId = JSON.parse(data.themeId);
  
  fetchPageRenderSave("assets/your-custom-recommendations.js.liquid", themeId,"recommendations.html", "your_custom_recommendations", userAnswers);
  fetchPageRenderSave("assets/your-custom-macros.js.liquid", themeId, "macros.html", "your_custom_macros", quizResults);

  let interval = setInterval(function(){
    if(pdf_1_saved && pdf_2_saved){
      pdf_1_saved = false;
      pdf_2_saved = false;
      composeEmail(103149338852, "your_custom_macros", "your_custom_recommendations", userAnswers);
      clearInterval(interval);
    }
  });
  
});

function fetchPageRenderSave(assetName, themeId, filename, elementId, renderData){
const apiKey = process.env.API_KEY;
const accessToken = process.env.API_ACCESS_TOKEN;
const store = process.env.SHOP_NAME;
const hostName = store + '.myshopify.com';
const apiVersion = '2023-01';
const apiLocation = '/admin/api/';
const resource = "/themes/" + themeId;
const shopAssetsUrl = 'https://' + hostName + apiLocation + apiVersion + resource +  '/assets.json?asset[key]=' + assetName;

let url = shopAssetsUrl;

fetch   (
    url,
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token" : accessToken
        }
    }
  )
  .then(res => {
      console.log('status = ' + res.status + ' , ' + res.statusText);
      getData(res, filename, elementId, renderData);

  })
  .catch(err => console.error(err));
}

async function getData(res, filename, elementId ,renderData){
  let parser = new DomParser();
  let data = await res.text();
  data = parser.parseFromString(data, "text/xml");
  data = JSON.parse(data.rawHTML).asset.value
  data = parser.parseFromString(data, "text/xml");
  let html = data.getElementById(elementId).innerHTML;
  
  html = ejs.render(html, {data: renderData});
  
  fs.writeFile('./public/'+ filename, html, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("The file was saved!");
    html_to_pdf(filename, elementId);
  }); 

}

function composeEmail(emailPageId, macrosFileName, recommFileName, userAnswers){
const apiKey = process.env.API_KEY;
const accessToken = process.env.API_ACCESS_TOKEN;
const store = process.env.SHOP_NAME;
const hostName = store + '.myshopify.com';
const apiVersion = '2023-01';
const apiLocation = '/admin/api/';
const resource = "/pages/" + emailPageId;
const shopAssetsUrl = 'https://' + hostName + apiLocation + apiVersion + resource +  '.json';
let url = shopAssetsUrl;

fetch   (
    url,
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token" : accessToken
        }
    }
  )
  .then(res => {
        console.log('status = ' + res.status + ' , ' + res.statusText);
        getEmailTemplate(res, macrosFileName, recommFileName, userAnswers);
    })
    .catch(err => console.error(err));
  }

 async function getEmailTemplate(res, macrosFileName, recommFileName, renderData){
  let parser = new DomParser();
  let data = await res.text();
  data = parser.parseFromString(data, "text/xml");
  
  html = JSON.parse(data.rawHTML).page.body_html;
  html = html.replaceAll("&lt;", "<");
  html = html.replaceAll("&gt;", ">");
  html = ejs.render(html, {data: renderData.personal_details});

  let pathToAttachment1 = macrosFileName + ".pdf";
  let pathToAttachment2 = recommFileName + ".pdf";
  attachment1 = fs.readFileSync(pathToAttachment1).toString("base64");
  attachment2 = fs.readFileSync(pathToAttachment2).toString("base64");
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    to: renderData.personal_details.email,
    from: 'Justin@iamclovis.com', // Use the email address or domain you verified above
    subject: 'Your Custom Nutrition Plan',
    html: html,
    attachments: [
      {
        content: attachment1,
        filename: pathToAttachment1,
        type: "application/pdf",
        disposition: "attachment"
      },
      {
        content: attachment2,
        filename: pathToAttachment2,
        type: "application/pdf",
        disposition: "attachment"
      }
    ]
  };


  //ES6
  sgMail
    .send(msg)
    .then(() => {}, error => {
      console.error(error);
  
      if (error.response) {
        console.error(error.response.body)
      }
    });
}

  
app.listen(PORT, function(err){
    if (err) console.log("Error in server setup")
    console.log("Server listening on Port", PORT);
})