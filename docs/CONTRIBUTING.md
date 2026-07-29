# 贡献指南 / Contributing Guide

感谢您对 LanhuFlow MCP 项目的关注！我们欢迎任何形式的贡献。

Thank you for your interest in the LanhuFlow MCP project! We welcome all forms of contributions.

[English](#english) | [简体中文](#简体中文)

---

## 简体中文

### 🤝 如何贡献

#### 报告 Bug

如果您发现了 Bug，请通过 [GitHub Issues](https://github.com/bangjier/lanhu-flow/issues) 提交,并包含以下信息：

- **Bug 描述**：清晰简洁的描述
- **复现步骤**：详细的复现步骤
- **期望行为**：您期望发生什么
- **实际行为**：实际发生了什么
- **环境信息**：
  - 操作系统和版本
  - Node.js 版本
  - npm / npx 版本
- **相关日志**：错误堆栈或日志信息
- **截图**（如适用）

#### 提出新功能

如果您有新功能的想法：

1. 先查看 [Issues](https://github.com/bangjier/lanhu-flow/issues) 确认是否已有相关讨论
2. 创建一个新的 Feature Request Issue
3. 详细描述功能的使用场景和预期效果
4. 如果可能，提供实现思路

#### 提交代码

**准备工作：**

```bash
# 1. Fork 本仓库到您的账号

# 2. 克隆您的 Fork
git clone https://github.com/YOUR_USERNAME/lanhu-flow.git
cd lanhu-flow

# 3. 添加上游仓库
git remote add upstream https://github.com/bangjier/lanhu-flow.git

# 4. 安装依赖
npm install
```

**开发流程：**

```bash
# 1. 创建功能分支
git checkout -b feature/your-feature-name

# 2. 进行开发
# ... 编写代码 ...

# 3. 类型检查
npm run check

# 4. 运行测试
npm test

# 5. 构建验证
npm run build

# 6. 提交更改
git add .
git commit -m "feat: add amazing feature"

# 7. 推送到您的 Fork
git push origin feature/your-feature-name

# 8. 在 GitHub 上创建 Pull Request
```

**提交信息规范：**

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式调整（不影响功能）
- `refactor:` 重构（既不是新功能也不是 Bug 修复）
- `perf:` 性能优化
- `test:` 测试相关
- `chore:` 构建过程或辅助工具的变动

**示例：**
```bash
feat: add support for Figma design import
fix: resolve cache invalidation issue when version changes
docs: update README with new configuration options
refactor: extract design token logic into separate module
```

### 📋 代码规范

#### TypeScript 代码风格

- 使用 TypeScript strict 模式
- 使用 `npm run check`（`tsc --noEmit`）进行类型检查
- 函数和接口使用 JSDoc 注释说明用途
- 复杂逻辑需要添加注释

**示例：**

```typescript
/** 从蓝湖 URL 获取元数据 */
async function fetchMetadata(url: string, useCache = true): Promise<DesignMeta> {
  if (!url.includes('lanhuapp.com')) {
    throw new Error(`Invalid Lanhu URL: ${url}`);
  }
  // 实现代码...
}
```

#### 命名约定

- 类名 / 接口名 / 类型名：`PascalCase`（例如：`DesignToken`, `SketchLayer`）
- 函数名 / 变量名：`camelCase`（例如：`getPagesList`, `designTokens`）
- 常量：`UPPER_CASE`（例如：`BASE_URL`, `DEFAULT_TIMEOUT`）
- 文件名：`camelCase.ts`（例如：`designTools.ts`, `sketchParser.ts`）

#### 错误处理

- 使用明确的异常类型
- 提供有意义的错误消息
- 记录错误日志

```typescript
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json();
} catch (error) {
  console.error(`Failed to fetch data from ${url}:`, error);
  throw error;
}
```

### 🧪 测试

如果您添加了新功能，请编写相应的测试：

```typescript
// tests-ts/example.test.ts
import { describe, it, expect } from 'vitest';
import { parseDesignUrl } from '../src/lanhu/urlParser';

describe('parseDesignUrl', () => {
  it('should extract project ID from design URL', () => {
    const url = 'https://lanhuapp.com/web/#/item/project/stage?tid=xxx&pid=123';
    const result = parseDesignUrl(url);
    expect(result.pid).toBe('123');
  });
});
```

运行测试：

```bash
npm test              # 运行所有测试
npm test -- --watch   # 监听模式
```

### 📖 文档

如果您更改了 API 或添加了新功能，请更新相关文档：

- 更新 README.md
- 更新工具的 JSDoc 注释
- 添加使用示例
- 更新英文文档（docs/README_EN.md）

### 🔍 代码审查

所有 Pull Request 都需要经过代码审查。请确保：

- ✅ 代码通过类型检查（`npm run check`）
- ✅ 测试通过（`npm test`）
- ✅ 遵循项目代码规范
- ✅ 有完整的提交信息
- ✅ 有相关的测试（如适用）
- ✅ 文档已更新（如适用）

### ⚠️ 安全注意事项

- **不要**提交包含真实 Cookie 的代码
- **不要**提交包含真实 API 密钥的代码
- **不要**提交包含用户隐私数据的代码
- 使用环境变量或配置文件处理敏感信息
- 在提交前检查 `.gitignore` 是否正确配置

---

## English

### 🤝 How to Contribute

#### Report Bugs

If you find a bug, please submit it through [GitHub Issues](https://github.com/bangjier/lanhu-flow/issues) with the following information:

- **Bug Description**: Clear and concise description
- **Reproduction Steps**: Detailed steps to reproduce
- **Expected Behavior**: What you expected to happen
- **Actual Behavior**: What actually happened
- **Environment Info**:
  - OS and version
  - Node.js version
  - npm / npx version
- **Related Logs**: Error stack or log information
- **Screenshots** (if applicable)

#### Suggest New Features

If you have ideas for new features:

1. Check [Issues](https://github.com/bangjier/lanhu-flow/issues) to see if there's already a discussion
2. Create a new Feature Request Issue
3. Describe the use case and expected behavior in detail
4. Provide implementation ideas if possible

#### Submit Code

**Preparation:**

```bash
# 1. Fork this repository to your account

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/lanhu-flow.git
cd lanhu-flow

# 3. Add upstream repository
git remote add upstream https://github.com/bangjier/lanhu-flow.git

# 4. Install dependencies
npm install
```

**Development Workflow:**

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Develop
# ... write code ...

# 3. Type check
npm run check

# 4. Run tests
npm test

# 5. Build verification
npm run build

# 6. Commit changes
git add .
git commit -m "feat: add amazing feature"

# 7. Push to your fork
git push origin feature/your-feature-name

# 8. Create Pull Request on GitHub
```

**Commit Message Convention:**

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation update
- `style:` Code style change (no functionality change)
- `refactor:` Refactoring (neither feature nor bug fix)
- `perf:` Performance optimization
- `test:` Test-related
- `chore:` Build process or auxiliary tool changes

### 📋 Code Standards

#### TypeScript Code Style

- Use TypeScript strict mode
- Run `npm run check` (`tsc --noEmit`) for type checking
- Use JSDoc comments for functions and interfaces
- Add comments for complex logic

#### Naming Conventions

- Classes / Interfaces / Types: `PascalCase` (e.g., `DesignToken`, `SketchLayer`)
- Functions / Variables: `camelCase` (e.g., `getPagesList`, `designTokens`)
- Constants: `UPPER_CASE` (e.g., `BASE_URL`, `DEFAULT_TIMEOUT`)
- File names: `camelCase.ts` (e.g., `designTools.ts`, `sketchParser.ts`)

### 🧪 Testing

If you add new features, please write corresponding tests using Vitest.

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

### 📖 Documentation

If you change APIs or add new features, please update relevant documentation.

### ⚠️ Security Considerations

- **DO NOT** commit code with real Cookies
- **DO NOT** commit code with real API keys
- **DO NOT** commit code with user privacy data
- Use environment variables or config files for sensitive information
- Check `.gitignore` is properly configured before committing

---

## 📞 Questions?

If you have any questions, feel free to:

- Open an [Issue](https://github.com/bangjier/lanhu-flow/issues)

Thank you for contributing!
