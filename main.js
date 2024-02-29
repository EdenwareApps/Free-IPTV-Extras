const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const https = require('https');
const path = require('path');

const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    }),
    headers: {
        'User-Agent': 'VLC/3.0.8 LibVLC/3.0.8'
    }
});

async function test(link) {
    let tries = 0;
    while (tries < 2) {
        try {
            const response = await axiosInstance.head(link);
            return response.status
        } catch (error) {
            tries++;
        }
    }
    return 0
}

async function processFile(filePath, outputFolder, statusFolder) {
    const newFile = [];
    const comentarios = [];
    let header = '';

    const leitor = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    const linksInfo = [];
    const fileName = path.basename(filePath);
    const newFilePath = path.join(outputFolder, fileName);
    const infoJSONPath = path.join(statusFolder, `${fileName}.json`);

    let extinfLine = '';
    let existingLinksInfo = [];

    if (fs.existsSync(infoJSONPath)) {
        const existingData = fs.readFileSync(infoJSONPath, 'utf8');
        existingLinksInfo = JSON.parse(existingData);
    }

    for await (const linha of leitor) {
        if (linha.startsWith('#EXTINF:')) {
            extinfLine = "\n"+ linha;
            if(header) {
                newFile.push(header);
                header = '';
            }
        } else if (!extinfLine) {
            header += linha;
        } else if (linha.startsWith('#')) {
            comentarios.push(linha);
        } else if (linha.trim().length < 4) {
            continue;
        } else {
            const link = linha.trim();
            let linkInfo = { link, status: -1, timestamp: null };

            const index = linksInfo.findIndex(item => item.link === link);
            if (index !== -1) {
                linkInfo = linksInfo[index];
            } else {
                linkInfo.status = await test(link);
            }

            if (linkInfo.status >= 200 && linkInfo.status < 400) {
                newFile.push(extinfLine);
                newFile.push(...comentarios);
                newFile.push(link);
            } else {
                console.log(`Link ${link} failed. Removing from output.`);
            }

            const existingIndex = existingLinksInfo.findIndex(item => item.link === link);
            if (existingIndex !== -1) {
                const existingLinkInfo = existingLinksInfo[existingIndex];
                if (existingLinkInfo.status !== linkInfo.status) {
                    linkInfo.timestamp = new Date().toISOString();
                    linksInfo[existingIndex] = linkInfo;
                } else {
                    linksInfo[existingIndex] = existingLinkInfo;
                }
            } else {
                linkInfo.timestamp = new Date().toISOString();
                linksInfo.push(linkInfo);
            }

            comentarios.length = 0;
        }
    }

    const updatedLinksInfo = linksInfo;
    fs.writeFileSync(newFilePath, newFile.join('\n'));
    fs.writeFileSync(infoJSONPath, JSON.stringify(updatedLinksInfo, null, 2));
}

async function processFolder(inputFolder, outputFolder, statusFolder) {
    try {
        const arquivos = fs.readdirSync(inputFolder);
        for (const arquivo of arquivos) {
            if (arquivo.endsWith('.m3u')) {
                const filePath = path.join(inputFolder, arquivo);
                await processFile(filePath, outputFolder, statusFolder);
            }
        }
    } catch (error) {
        console.error('Error processing folder:', error);
    }
}

const inputFolder = './sources';
const outputFolder = './output';
const statusFolder = './status';

processFolder(inputFolder, outputFolder, statusFolder);
