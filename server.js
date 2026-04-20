const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const AWS = require('aws-sdk');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Инициализация Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Настройка Selectel S3
const s3 = new AWS.S3({
  endpoint: 'https://s3.ru-1.storage.selcloud.ru', 
  accessKeyId: process.env.S3_KEY,
  secretAccessKey: process.env.S3_SECRET,
  s3ForcePathStyle: true,
});

const upload = multer({ storage: multer.memoryStorage() });

// Эндпоинт для ИИ-парсинга
app.post('/ai-parse', async (req, res) => {
  try {
    const { text } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Ты — ассистент Helpy. Распарси текст об учебных долгах: "${text}". 
    Верни ТОЛЬКО чистый JSON (без markdown): {"subject": "Название", "type": "лаба|типовик|курсач", "info": "комментарий"}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    res.json(JSON.parse(response.text()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Эндпоинт для загрузки в S3
app.post('/upload', upload.single('file'), (req, res) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${Date.now()}-${req.file.originalname}`,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  };

  s3.upload(params, (err, data) => {
    if (err) return res.status(500).send(err);
    res.json({ fileUrl: data.Location });
  });
});

app.listen(process.env.PORT || 3000);