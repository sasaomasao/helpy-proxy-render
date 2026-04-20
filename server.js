const express = require('express');
const cors = require('cors');
const multer = require('multer');
const AWS = require('aws-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// Разрешаем запросы с любого адреса (нужно для мобилки)
app.use(cors());
app.use(express.json());

// Инициализация Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Настройка Selectel S3
const s3 = new AWS.S3({
  endpoint: 'https://s3.ru-1.storage.selcloud.ru', // Стандартный эндпоинт Selectel
  accessKeyId: process.env.S3_KEY,
  secretAccessKey: process.env.S3_SECRET,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

// Настройка загрузки файлов в оперативную память перед отправкой в S3
const upload = multer({ storage: multer.memoryStorage() });

// === ЭНДПОИНТ 1: Парсинг долгов через ИИ ===
app.post('/ai-parse', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Нет текста для парсинга' });

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Ты — ассистент Helpy. Распарси текст об учебных долгах: "${text}". 
    Верни ТОЛЬКО чистый JSON (без markdown и блоков кода), в формате: 
    { "subject": "Название", "type": "лаба|типовик|курсач", "info": "комментарий" }`;
    
    const result = await model.generateContent(prompt);
    // Очищаем ответ от возможных обратных кавычек ```json
    const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.json(JSON.parse(cleanText));
  } catch (e) {
    console.error("Gemini Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// === ЭНДПОИНТ 2: Загрузка файлов в S3 ===
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${Date.now()}-${Buffer.from(req.file.originalname, 'latin1').toString('utf8')}`,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.error("S3 Upload Error:", err);
      return res.status(500).send({ error: 'Ошибка загрузки в S3' });
    }
    // Возвращаем URL загруженного файла
    res.json({ fileUrl: data.Location });
  });
});

// === ЭНДПОИНТ 3: Проверка статуса (чтобы знать, что сервер не упал) ===
app.get('/', (req, res) => {
  res.send('Helpy Backend is running! 🚀');
});

// Запуск сервера
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));