const fs = require('fs/promises');
const puppeteer = require('puppeteer');
const express = require('express');
const ejs = require('ejs');
const fetch = require('node-fetch');
const DomParser = require('dom-parser');
const sgMail = require('@sendgrid/mail');

const PORT = 3000;

require('dotenv').config();

const app = express();

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

async function html_to_pdf(filename, pdfName) {
  try {
    const browser = await puppeteer.launch();
    // Create a new page
    const page = await browser.newPage();

    // Website URL to export as pdf
    const website_url = 'http://localhost:3000/' + filename;

    // Open URL in current page
    await page.goto(website_url, { waitUntil: 'networkidle0' });

    //To reflect CSS used for screens instead of print
    await page.emulateMediaType('screen');

    // Downlaod the PDF
    await page.pdf({
      path: pdfName + '.pdf',
      margin: { top: '100px', right: '50px', bottom: '100px', left: '50px' },
      printBackground: true,
      format: 'A3',
    });
    console.log(pdfName + ".pdf saved successfully !!!");
    await browser.close();
  } catch (err) {
    console.log('error in html_to_pdf', err);
  }
}

app.get('/', (req, res) => {
  res.send('Wellcome to Clovis Quiz App Server !!!!');
})

app.post('/composePlan', async (req, res) => {

  const macrosPdfFileName = "your_custom_macros";
  const recommendationsPdfFileName = "your_custom_recommendations";
  const macrosHtmlFilename = 'macros.html';
  const recommendationsHtmlFilename = 'recommendations.html';
  const emailTemplatePageId = "103149338852";
  try {

    let data = req.body;
    let userAnswers = JSON.parse(data.userAnswers);
    let quizResults = JSON.parse(data.quizResults);
    let themeId = JSON.parse(data.themeId);

    const [resRecomm, resMacros] = await Promise.all([
      fetchPage('assets/your-custom-recommendations.js.liquid', themeId),
      fetchPage('assets/your-custom-macros.js.liquid', themeId),
    ]);

    await Promise.all([
      getData(resRecomm, recommendationsHtmlFilename, userAnswers),
      getData(resMacros, macrosHtmlFilename, quizResults),
    ]);

    await Promise.all([
      html_to_pdf(recommendationsHtmlFilename, recommendationsPdfFileName),
      html_to_pdf(macrosHtmlFilename, macrosPdfFileName),
    ]);

    const resEmail = await fetchEmailTemplate(emailTemplatePageId);
    await composeEmail(resEmail, macrosPdfFileName, recommendationsPdfFileName, userAnswers);

    res.send(req.body);
  } catch (err) {
    console.log('error in post endpoint', err);
  }
});

async function fetchPage(assetName, themeId) {
  try {
    const apiKey = process.env.API_KEY;
    const accessToken = process.env.API_ACCESS_TOKEN;
    const store = process.env.SHOP_NAME;
    const hostName = store + '.myshopify.com';
    const apiVersion = '2023-01';
    const apiLocation = '/admin/api/';
    const resource = '/themes/' + themeId;
    const shopAssetsUrl =
      'https://' +
      hostName +
      apiLocation +
      apiVersion +
      resource +
      '/assets.json?asset[key]=' +
      assetName;

    let url = shopAssetsUrl;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
    });
    console.log("Page" + assetName + " Fetched Successfully!!!");
    return res;
  } catch (err) {
    console.log('error in fetchPageRenderSave', err);
  }
}

async function getData(res, filename, renderData) {
  try {
    let parser = new DomParser();
    let data = await res.text();
    data = parser.parseFromString(data, 'text/xml');

    let html = JSON.parse(data.rawHTML).asset.value;
    
    html = ejs.render(html, { data: renderData });

    await fs.writeFile('./public/' + filename, html);
    console.log("Html data rendered and saved in file " + filename + " !!!");
    return;
  } catch (err) {
    console.log('error in getData', err);
  }
}

async function fetchEmailTemplate(emailPageId) {
  try {
    const apiKey = process.env.API_KEY;
    const accessToken = process.env.API_ACCESS_TOKEN;
    const store = process.env.SHOP_NAME;
    const hostName = store + '.myshopify.com';
    const apiVersion = '2023-01';
    const apiLocation = '/admin/api/';
    const resource = '/pages/' + emailPageId;
    const shopAssetsUrl = 'https://' + hostName + apiLocation + apiVersion + resource + '.json';
    let url = shopAssetsUrl;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
    });

    console.log("Email Template fetched successfully from Shopify Page Id: " + emailPageId + " !!!");

    return res;

  } catch (err) {
    console.log('error in composeEmail', err);
  }
}

async function composeEmail(res, macrosFileName, recommFileName, renderData) {
  try {
    let parser = new DomParser();
    let data = await res.text();

    data = parser.parseFromString(data, 'text/xml');

    let html = JSON.parse(data.rawHTML).page.body_html;
    html = html.split('&lt;').join('<');
    html = html.split('&gt;').join('>');
    html = ejs.render(html, { data: renderData.personal_details });

    let pathToAttachment1 = macrosFileName + '.pdf';
    let pathToAttachment2 = recommFileName + '.pdf';
    attachment1 = await fs.readFile(pathToAttachment1);
    attachment2 = await fs.readFile(pathToAttachment2);
    attachment1 = attachment1.toString('base64');
    attachment2 = attachment2.toString('base64');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    let unixTimestamp = Math.floor(new Date().getTime()/1000);
    
    const msg = {
      to: renderData.personal_details.email,
      from: 'Justin@iamclovis.com', // Use the email address or domain you verified above
      subject: 'Your Custom Nutrition Plan',
      html: html,
      attachments: [
        {
          content: attachment1,
          filename: pathToAttachment1,
          type: 'application/pdf',
          disposition: 'attachment',
        },
        {
          content: attachment2,
          filename: pathToAttachment2,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
      sendAt: (unixTimestamp + Number(renderData.send_email_after) * 60)
    };
    await sgMail.send(msg);
    console.log("Email sent Successfully !!!");
  } catch (err) {
    console.log('error in getEmailTemplate', err);
  }
}

app.listen(PORT, function (err) {
  if (err) console.log('Error in server setup');
  console.log('Server listening on Port', PORT);
});