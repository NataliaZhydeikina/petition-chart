const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const jsonParser = bodyParser.json();

let createHTML = (subs) => {
    const html = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Кількість людей, що підписувала петицію за легалізацію одностатевих шлюбів по дням</title>
</head>

<body>
    <canvas id="myChart" width="400" height="400"></canvas>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        const labels = [
            ${Object.keys(subs).map(date => `'${date}'`)}
        ];

        const data = {
            labels: labels,
            datasets: [{
                label: 'My First dataset',
                backgroundColor: 'rgb(255, 99, 132)',
                borderColor: 'rgb(255, 99, 132)',
                data: [ ${Object.values(subs).map(date => `'${date}'`)}],
            }]
        };

        const config = {
            type: 'line',
            data: data,
            options: {}
        };
    </script>
    <script>
        const myChart = new Chart(
            document.getElementById('myChart'),
            config
        );
    </script>
</body>

</html>`;
    // fs.writeFile('newChart.html', html, function (err) {
    //     if (err) throw err;
    //     console.log('File is created successfully.');
    // });
    return html;
}

let changeSubscribers = (result, subscribers) => {
    for (let prop in result) {
        if (prop in subscribers) {
            subscribers[prop] += parseInt(result[prop]);
        } else {
            subscribers[prop] = parseInt(result[prop]);
        }
    }
    return subscribers;
}
let createSubscribers = () => {
    const subscribers = {};
    return async function readSubscribers(page) {
        let subscripersPerPage = await page.evaluate(() => {
            let table = [...document.querySelectorAll('.table_cell.date')].map(el => el.innerText);
            let count = {};
            table.forEach(function (i) { count[i] = (count[i] || 0) + 1; });
            return count;
        });
        return changeSubscribers(subscripersPerPage, subscribers);
    }
}

let clickNextSubs = async (page) => {
    let current = await page.evaluate(async () => {
        let lis = [...document.querySelectorAll('.pag_link')];
        lis = lis.filter(li => !li.classList.contains('disabled'));
        let activeLi = lis.find((link, index) => index > 0 && lis[index - 1].classList.contains('active'));
        if (!activeLi) return activeLi;
        await activeLi.click();
        return activeLi.innerText;
    });
    await page.waitForTimeout(500);
    return current;
}

let clickPaginations = async (page) => {
    let subscribers = {};
    let hasNext = false;
    let prevPage = -1;
    const readSubscribers = createSubscribers();
    do {
        subscribers = await readSubscribers(page);
        let currPage = await clickNextSubs(page);
        if (!currPage || prevPage === currPage) hasNext = false;
        else hasNext = true;
        prevPage = currPage;
    } while (hasNext);
    return subscribers;
}

let scrape = async ({ url }) => {
    let subscribers = {};
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(url, { timeout: 0, waitUntil: 'networkidle0' });

        const tab = await page.$('[data-id=pet-tab-3]');
        if (tab === null) throw Error('No tab');
        await tab.click();

        subscribers = await clickPaginations(page);
    } finally {
        browser.close();
    }
    return subscribers;
};


app.post('/', jsonParser, function (req, res) {
    scrape(req.body)
        .then((value) => res.json(value))
        .catch(e => res.status(404).json({ error: e }));
});

app.get('/', function (req, res) {
    res.send(fs.readFileSync('./index.html', 'utf8'));
})

http.createServer(app).listen(process.env.PORT || 3000);