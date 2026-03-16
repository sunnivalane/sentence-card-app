export async function POST(req: Request) {
  try {
    const { sentence } = await req.json();

    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [
          {
            role: "user",
            content: `请为这个英语句子生成学习卡片：

句子: ${sentence}

返回JSON格式：
{
translation:"",
keywords:"",
example:""
}`,
          },
        ],
      }),
    });

    const data = await response.json();

    return Response.json(data);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "AI generation failed" }, { status: 500 });
  }
}
