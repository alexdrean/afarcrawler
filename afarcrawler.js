const puppeteer = require("puppeteer")
const {readFileSync, writeFileSync, existsSync} = require("fs");
const shuffle = require("shuffle-array")
const cron = require("node-cron")
const {Hook} = require("hookcord");
require('log-timestamp');


const config = JSON.parse(readFileSync("config.json", {encoding: "utf8"}))
const _filepath = "history.json";

if (process.env["DEBUG"]) {
    sendLatest().catch(r => console.error(r))
} else {
    cron.schedule('0 * * * *', () => {
        sendLatest().catch(r => console.error(r))
    })
}

async function sendLatest() {
    const res = shuffle(await getLatest())
    for (const item of res) {
        const payload = {
            content: item.phase.prefix,
            embeds: [{
                title: item.titre,
                author: {
                    name: item.phase.author,
                    icon_url: item.phase.authorImage,
                },
                color: parseInt(item.phase.color, 16),
                description: item.texte.replaceAll(/^(.+) : (.+)$/gim, "**$1** : $2"),
                thumbnail: {
                    url: item.phase.image,
                }
            }]
        }
        if (!process.env["DO_NOT_SEND"]) {
            await new Hook()
                .setLink(config.webhook)
                .setPayload(payload)
                .fire()
        }
        await addToHistory(item)
    }
}

async function getLatest() {
    const contents = await getContents()
    if (!existsSync(_filepath)) {
        writeFileSync(_filepath, JSON.stringify({items: {}}, null, 4), {encoding: "utf8"})
    }
    let history = JSON.parse(readFileSync(_filepath, {encoding: "utf8"}));
    const newContents = contents.filter(item => history.items[item.titre] === undefined)
    console.log(Object.keys(history.items).length + " items in history,", newContents.length + " new items")
    if (newContents.length > 0) {
        for (const item of newContents) {
            console.log("Found new item: " + item.titre)
        }
    }
    return newContents
}

async function addToHistory(item) {
    let history = JSON.parse(readFileSync(_filepath, {encoding: "utf8"}));
    if (!history.items) history.items = {}
    console.log("Saved to history: " + item.titre)
    history.items[item.titre] = {first_seen: new Date().getTime()}
    writeFileSync(_filepath, JSON.stringify(history, null, 4), {encoding: "utf8"})
}

async function getContents() {
    const browser = await puppeteer.launch({
        headless: true
    });
    const resultat = []
    const page = await browser.newPage();
    for (const phase of config.phases) {
        console.log("Goto", phase.url)
        await page.goto(phase.url);
        (await page.evaluate((phase) => {
            const res = []
            console.log("query div.boite")
            const sel = document.querySelectorAll('div.boite_texte_accueil2');
            sel.forEach(function (e) {
                console.log("query titre & texte")
                const titre = e.querySelector(".titre").textContent
                const texte = e.querySelector(".texte").textContent.replace(/[^\S\r\n]+/g, " ").trim()
                res.push({titre, texte, phase});
            })
            return res
        }, phase)).forEach(item => resultat.push(item))
    }
    await browser.close();
    return resultat
}

