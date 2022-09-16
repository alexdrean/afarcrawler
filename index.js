const puppeteer = require("puppeteer")
const {Webhook, MessageBuilder} = require('discord-webhook-node');
const {readFileSync, writeFileSync, existsSync} = require("fs");
const shuffle = require("shuffle-array")
const cron = require("node-cron")


const config = JSON.parse(readFileSync("config.json", {encoding: "utf8"}))
const hook = new Webhook(config.webhook);
const _filepath = "history.json";

cron.schedule('0 * * * *', () => {
    sendLatest().catch(r => console.error(r))
})

async function sendLatest() {
    const res = shuffle(await getLatest())
    for (const item of res) {
        const embed = new MessageBuilder()
            .setTitle(item.titre)
            .setAuthor(item.phase.author)
            .setColor(item.phase.color)
            .setDescription(item.texte.replaceAll(/^(.+) : (.+)$/gim, "**$1** : $2"))
            .setThumbnail(item.phase.image)
        await hook.send(embed)
    }
}

async function getLatest() {
    const contents = await getContents()
    if (!existsSync(_filepath)) {
        writeFileSync(_filepath, JSON.stringify({items: {}}, null, 4), {encoding: "utf8"})
    }
    let history = JSON.parse(readFileSync(_filepath, {encoding: "utf8"}));
    if (typeof history.items !== "object")
        history.items = {}
    const newContents = contents.filter(item => history.items[item.titre] === undefined)
    console.log(Object.keys(history.items).length + " items in history,", newContents.length + " new items")
    if (newContents.length > 0) {
        for (const item of newContents) {
            console.log("Found new item: " + item.titre)
            history.items[item.titre] = {first_seen: new Date().getTime()}
        }
        writeFileSync(_filepath, JSON.stringify(history, null, 4), {encoding: "utf8"})
    }
    return newContents
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

