// Optional: direct Google Gemini key smoke test (Node only). The app uses Supabase gemini-proxy instead.
// Run: GEMINI_API_KEY=... node test-gemini-api.js

require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('错误: 未找到 GEMINI_API_KEY 环境变量');
  console.log('请设置: export GEMINI_API_KEY=your_api_key');
  process.exit(1);
}

console.log('API Key 长度:', apiKey.length);
console.log('API Key 前缀:', apiKey.substring(0, 10) + '...');
console.log('\n正在连接 Gemini API...\n');

const genAI = new GoogleGenerativeAI(apiKey);

async function testAPI() {
  try {
    // 测试常见的模型名称（使用实际的模型名称，去掉 models/ 前缀）
    console.log('1. 测试常见模型和 API 调用...\n');
    const modelNamesToTest = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
    ];
    
    let workingModel = null;
    
    for (const modelName of modelNamesToTest) {
      try {
        console.log(`测试模型: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // 测试实际的 API 调用
        const result = await model.generateContent('Say "API test successful" in one sentence');
        const response = await result.response;
        const text = response.text();
        
        console.log(`  ✅ ${modelName} - API 调用成功！`);
        console.log(`  响应: ${text.substring(0, 80)}...\n`);
        workingModel = modelName;
        break; // 找到可用模型就停止
      } catch (error) {
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('401')) {
          console.log(`  ❌ ${modelName} - API Key 无效或未授权`);
          console.log(`  错误详情: ${errorMsg}`);
          throw error; // 如果是 API Key 问题，直接抛出
        } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
          console.log(`  ⚠️  ${modelName} - 模型不存在 (404)`);
          if (error.response) {
            console.log(`  状态码: ${error.response.status}`);
          }
          console.log(`  尝试下一个模型...\n`);
        } else {
          console.log(`  ⚠️  ${modelName} - 错误: ${errorMsg.substring(0, 100)}`);
          if (error.response) {
            console.log(`  状态码: ${error.response.status}`);
          }
          console.log('');
        }
      }
    }
    
    if (workingModel) {
      console.log('✅ API Key 测试成功！');
      console.log(`可用模型: ${workingModel}`);
      console.log('\n🎉 您的 GEMINI_API_KEY 配置正确，可以正常使用！');
    } else {
      console.log('❌ 所有测试的模型都不可用');
      console.log('请检查 API Key 权限和网络连接');
    }
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    
    if (error.message.includes('API_KEY_INVALID') || error.message.includes('401')) {
      console.error('\n⚠️  API Key 无效或未授权！请检查:');
      console.error('  1. API Key 是否正确');
      console.error('  2. API Key 是否有访问 Gemini API 的权限');
      console.error('  3. API Key 是否已启用');
      console.error('  4. 访问 https://makersuite.google.com/app/apikey 查看和管理 API Key');
    } else if (error.message.includes('403') || error.message.includes('permission')) {
      console.error('\n⚠️  权限不足！请检查:');
      console.error('  1. API Key 是否有访问 Gemini API 的权限');
      console.error('  2. 在 Google Cloud Console 中启用 Generative Language API');
    } else if (error.message.includes('quota') || error.message.includes('429')) {
      console.error('\n⚠️  API 配额已用完！');
      console.error('  请检查您的 API 使用配额');
    } else {
      console.error('\n完整错误信息:');
      console.error(error);
    }
  }
}

testAPI();

