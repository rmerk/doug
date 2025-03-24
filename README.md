# Doug - VS Code AI Coding Assistant

Doug is a VS Code extension that provides AI-powered coding assistance through integration with OpenRouter. It allows you to chat with various AI models right within your editor, add context from your workspace files, and get intelligent coding help.

## Features

- **Chat Interface**: Interact with AI models through a convenient chat panel in VS Code
- **Multiple AI Models**: Choose from various AI models available through OpenRouter
- **Context Management**: Add your code files to the conversation context for more relevant responses
- **Secure API Key Storage**: Your OpenRouter API key is stored securely using VS Code's secret storage

## Requirements

- Visual Studio Code 1.98.0 or higher
- OpenRouter API key (sign up at [openrouter.ai](https://openrouter.ai) if you don't have one)
- Internet connection for API communication

## Installation

You can install this extension through the VS Code Marketplace or by downloading and installing the VSIX file directly:

1. Download the `.vsix` file from the [releases page](https://github.com/yourusername/doug/releases)
2. In VS Code, go to Extensions view (Ctrl+Shift+X)
3. Click on the "..." menu in the top-right corner
4. Select "Install from VSIX..." and choose the downloaded file

## Getting Started

1. After installation, open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run the command "Doug: Open Chat Panel"
3. Enter your OpenRouter API key when prompted
4. Select an AI model using the "Doug: Select AI Model" command
5. Start chatting with the AI assistant!

## Extension Commands

- **Doug: Open Chat Panel** - Opens the AI assistant chat interface
- **Doug: Select AI Model** - Choose which AI model to use
- **Doug: Add Current File to Context** - Add the current file to conversation context

## Configuration

This extension contributes the following settings:

- `aiCodingAssistant.apiKey`: Your OpenRouter API key
- `aiCodingAssistant.defaultModel`: ID of the default model to use
- `aiCodingAssistant.contextWindowSize`: Maximum number of tokens to include in context window

## Privacy & Security

- Your OpenRouter API key is stored securely using VS Code's secret storage
- Code and conversations are sent to OpenRouter for processing
- No data is stored outside your local machine except what's processed by the API

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue for any bugs or feature requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
