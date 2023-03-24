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
  await browser.close();
}

app.post('/composePlan', (req, res)=> {
  let data = req.body;
  let userAnswers = JSON.parse(data.userAnswers);
  let quizResults = JSON.parse(data.quizResults);

  fetchPageRenderSave("https://www.iamclovis.com/pages/your-custom-recommendations", "recomm.html", "your_custom_recomm", userAnswers);
  fetchPageRenderSave("https://www.iamclovis.com/pages/your-custom-macros", "macros.html", "your_custom_macros", quizResults);
  composeEmail("https://www.iamclovis.com/pages/clovis-quiz-email-template", "quiz_email_template","your_custom_macros","your_custom_recomm",userAnswers);
});

function fetchPageRenderSave(url, filename, elementId, renderData){
  fetch   (
    url,
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
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

function composeEmail(url, elementId ,macrosFileName, recommFileName, userAnswers){
  fetch   (
    url,
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        }
    }
    )
    .then(res => {
        console.log('status = ' + res.status + ' , ' + res.statusText);
        getEmailTemplate(res, elementId, macrosFileName, recommFileName, userAnswers);
    })
    .catch(err => console.error(err));
  }

 async function getEmailTemplate(res, elementId, macrosFileName, recommFileName, renderData){
  let parser = new DomParser();
  let data = await res.text();
  data = parser.parseFromString(data, "text/xml");
  let html = data.getElementById(elementId).innerHTML;
  
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