const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = 3000;

let browser, page;
let coletaAtiva = false;
let contatosMap = new Map();

app.use(express.static('frontend'));

app.get('/start', async (req, res) => {
  if (coletaAtiva) return res.send('🚫 Já está coletando');

  console.log('🛫 Iniciando... escaneie o QR Code');
  browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.goto('https://web.whatsapp.com');
  coletaAtiva = true;
  contatosMap = new Map();

  setTimeout(() => iniciarColeta(), 60000); // espera escanear o QR

  res.send('🟢 Coleta iniciará após escanear QR Code');
});

app.get('/stop', async (req, res) => {
  coletaAtiva = false;
  gerarCSV();
  if (browser) await browser.close();
  res.send('✅ Coleta parada e CSV gerado');
});

app.get('/status', (req, res) => {
  res.json({
    total: contatosMap.size,
    coletaAtiva
  });
});

const iniciarColeta = async () => {
  console.log('🚀 Coleta iniciada...');
  let tentativas = 0;

  while (coletaAtiva && tentativas < 60) {
    await page.evaluate(() => {
      const container = document.querySelector('div[aria-label="Lista de conversas"]');
      if (container) container.scrollTop = container.scrollHeight;
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const novos = await page.evaluate(() => {
      const spans = document.querySelectorAll('span[title]');
      const lista = [];
      spans.forEach(span => {
        const nome = span.getAttribute('title');
        const regex = /^\+55\s?\d{2}\s?\d{4,5}-?\d{4}$/;
        if (nome && regex.test(nome)) {
          const limpo = nome.replace(/\s|-/g, '');
          lista.push({ original: nome, limpo });
        }
      });
      return lista;
    });

    novos.forEach(({ original, limpo }) => {
      contatosMap.set(limpo, original);
    });

    console.log(`📡 Total até agora: ${contatosMap.size}`);
    tentativas++;
  }

  console.log('🛑 Coleta finalizada');
};

const gerarCSV = () => {
  const header = [
    'First Name', 'Middle Name', 'Last Name',
    'Phonetic First Name', 'Phonetic Middle Name', 'Phonetic Last Name',
    'Name Prefix', 'Name Suffix', 'Nickname', 'File As',
    'Organization Name', 'Organization Title', 'Organization Department',
    'Birthday', 'Notes', 'Photo', 'Labels',
    'Phone 1 - Label', 'Phone 1 - Value'
  ].join(',');

  const linhas = [];
  let i = 1;
  for (const [limpo] of contatosMap.entries()) {
    const nome = `B${i.toString().padStart(3, '0')}`;
    linhas.push(`${nome},,,,,,,,,,,,,,,,* myContacts,Mobile,+${limpo}`);
    i++;
  }

  const finalCSV = `${header}\n${linhas.join('\n')}`;
  fs.writeFileSync('contatos.csv', finalCSV);
  console.log(`✅ CSV salvo com ${contatosMap.size} contatos`);
};

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
