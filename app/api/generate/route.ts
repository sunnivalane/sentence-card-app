const result = await response.json();

// 👉 打印完整返回（关键）
console.log("完整AI返回:", JSON.stringify(result, null, 2));

// 👉 强制拿到content
let content = "";

if (
  result &&
  result.choices &&
  result.choices.length > 0 &&
  result.choices[0].message &&
  result.choices[0].message.content
) {
  content = result.choices[0].message.content;
}

// 👉 清理 markdown 包裹
content = content.replace(/```json/g, "").replace(/```/g, "").trim();

console.log("AI内容:", content);

// 👉 尝试解析
let parsed;

try {
  parsed = JSON.parse(content);
} catch (e) {
  console.error("解析失败:", content);
  parsed = {
    translation: content,
    keywords: "",
    example: "",
  };
}

return Response.json(parsed);
