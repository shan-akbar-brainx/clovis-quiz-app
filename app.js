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

async function html_to_pdf(html) {
  try {
    const browser = await puppeteer.launch();
    // Create a new page
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    //To reflect CSS used for screens instead of print
    await page.emulateMediaType('screen');

    // Downlaod the PDF
    const buffer = await page.pdf({
      margin: { top: '100px', right: '50px', bottom: '100px', left: '50px' },
      printBackground: true,
      format: 'A3',
    });

    const base64Pdf = buffer.toString('base64');
    console.log("Pdf base64 string returned successfully!!!");
    await browser.close();
    return base64Pdf;
  } catch (err) {
    console.log('error in html_to_pdf', err);
  }
}

app.get('/', (req, res) => {
  res.send('Wellcome to Clovis Quiz App Server !!!!');
})

app.post('/composePlan', async (req, res) => {

  const emailTemplatePageId = "103149338852";
  const customRecommendationPageId = "103030423780"
  try {

    let data = req.body;
    let userAnswers = JSON.parse(data.userAnswers);
    let quizResults = JSON.parse(data.quizResults);
    let themeId = JSON.parse(data.themeId);

    const [resRecomm, resMacros] = await Promise.all([
      fetchPageTemplate(customRecommendationPageId),
      fetchPage('assets/your-custom-macros.js.liquid', themeId),
    ]);

    const [html_recommendations, html_macros] = await Promise.all([
      getPageData(resRecomm, userAnswers),
      getAssetData(resMacros, quizResults),
    ]);

    const [recommendations_attachment, macros_attachment] = await Promise.all([
      html_to_pdf(html_recommendations),
      html_to_pdf(html_macros),
    ]);

    const resEmail = await fetchPageTemplate(emailTemplatePageId);
    await composeEmail(resEmail, recommendations_attachment, macros_attachment, userAnswers);

    res.send(req.body);

    console.log("request completed successfully !!!");

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

async function getAssetData(res, renderData) {
  try {
    let parser = new DomParser();
    let data = await res.text();
    data = parser.parseFromString(data, 'text/xml');

    let html = JSON.parse(data.rawHTML).asset.value;
    
    html = ejs.render(html, { data: renderData });

    console.log("Data rendered using ejs and html string returned !!!");
    return html;
  } catch (err) {
    console.log('error in getAssetData', err);
  }
}

async function getPageData(res, renderData) {
  try {
    let parser = new DomParser();
    let data = await res.text();

    data = parser.parseFromString(data, 'text/xml');

    let html = JSON.parse(data.rawHTML).page.body_html;
    html = html.split('&lt;').join('<');
    html = html.split('&gt;').join('>');
    html = html.split('&amp;').join('&');
    html = ejs.render(html, { data: renderData });
    
    console.log("Data rendered using ejs and html string returned !!!");
    return html;
  } catch (err) {
    console.log('error in getPageData', err);
  }
}

async function fetchPageTemplate(pageId) {
  try {
    const apiKey = process.env.API_KEY;
    const accessToken = process.env.API_ACCESS_TOKEN;
    const store = process.env.SHOP_NAME;
    const hostName = store + '.myshopify.com';
    const apiVersion = '2023-01';
    const apiLocation = '/admin/api/';
    const resource = '/pages/' + pageId;
    const shopAssetsUrl = 'https://' + hostName + apiLocation + apiVersion + resource + '.json';
    let url = shopAssetsUrl;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
    });

    console.log("Page Template fetched successfully from Shopify Page Id: " + pageId + " !!!");

    return res;

  } catch (err) {
    console.log('error in composeEmail', err);
  }
}

async function composeEmail(res, recommendations_attachment, macros_attachment, renderData) {
  try {
    let html = await getPageData(res, renderData.personal_details)

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    let unixTimestamp = Math.floor(new Date().getTime()/1000);
    
    const msg = {
      to: renderData.personal_details.email,
      from: 'Justin@iamclovis.com', // Use the email address or domain you verified above
      subject: 'Your Custom Nutrition Plan',
      html: html,
      attachments: [
        {
          content: recommendations_attachment,
          filename: "Your Custom Recommendations",
          type: 'application/pdf',
          disposition: 'attachment',
        },
        {
          content: macros_attachment,
          filename: "Your Custom Macros",
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