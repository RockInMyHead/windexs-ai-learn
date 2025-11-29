console.log("=== Server starting ===");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("PORT:", process.env.PORT || 4000);
console.log("CORS origins allowed:", process.env.CORS_ORIGIN || "https://teacher.windexs.ru");
console.log("Proxy enabled:", process.env.PROXY_ENABLED);
console.log("OpenAI key length:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : "NOT SET");

