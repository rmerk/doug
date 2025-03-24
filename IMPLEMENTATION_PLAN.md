# VS Code Extension: AI Coding Assistant with OpenRouter Integration

<extension_plan>
## 1. Main Components and Responsibilities

### Core Components:
1. **Extension Activation & Command Registration**
   - Responsible for initializing the extension
   - Registering all commands in VS Code command palette
   - Setting up event listeners and context subscriptions

2. **OpenRouter Integration Service**
   - Managing API communication with OpenRouter
   - Fetching and caching available models
   - Handling authentication and API keys
   - Processing completions and responses

3. **Model Selection Manager**
   - Providing model selection UI
   - Storing and retrieving user's preferred models
   - Managing model-specific configurations

4. **Context Management System**
   - Capturing and storing conversation context
   - Managing context window size and relevance
   - Supporting multi-file context understanding

5. **Agent-Based File Modification Service**
   - Reading workspace files
   - Applying changes to files safely
   - Handling permissions and validation
   - Supporting multi-file operations

6. **UI Components**
   - WebView panel for chat interface
   - Quick pick menus for model selection
   - Status bar integration for current model and context
   - Progress indicators for ongoing operations

7. **Configuration Manager**
   - Storing user preferences
   - Managing API keys securely
   - Configuring extension behavior

8. **Telemetry & Logging Service** (optional)
   - Anonymous usage tracking
   - Error reporting
   - Performance monitoring

### Supporting Components:
1. **Type Definitions & Interfaces**
   - OpenRouter API types
   - Extension state types
   - Configuration types

2. **Utility Functions**
   - Text processing helpers
   - Code parsing utilities
   - Context extraction algorithms

3. **Test Suites**
   - Unit tests for each service
   - Integration tests for component interaction
   - Mocks for external dependencies

## 2. Extension Architecture

The extension will follow a modular, service-oriented architecture with clear separation of concerns:

```
src/
├── test/                          # Test directory
│   ├── extension.test.ts          # Main test file
│   ├── openRouter.test.ts         # OpenRouter service tests
│   ├── contextManager.test.ts     # Context management tests
│   ├── fileModifier.test.ts       # File modification tests
│   └── helpers/                   # Test helpers
├── services/                      # Core services
│   ├── openRouterService.ts       # OpenRouter API integration
│   ├── contextService.ts          # Context management
│   ├── fileService.ts             # File operations
│   └── configService.ts           # Extension configuration
├── ui/                            # UI components
│   ├── webviewPanel.ts            # Chat panel implementation
│   ├── modelSelector.ts           # Model selection UI
│   └── statusBarItem.ts           # Status bar integration
├── types/                         # Type definitions
│   ├── openRouter.ts              # OpenRouter API types
│   ├── extension.ts               # Extension state types
│   └── config.ts                  # Configuration types
├── utils/                         # Utility functions
│   ├── textProcessing.ts          # Text processing utilities
│   ├── contextHelpers.ts          # Context extraction helpers
│   └── security.ts                # Security-related utilities
└── extension.ts                   # Main extension entry point
```

The architecture will implement:
- **Service Locator Pattern**: For dependency management
- **Command Pattern**: For implementing VS Code commands
- **Observer Pattern**: For event handling
- **Repository Pattern**: For data storage

State management will use immutable patterns where possible to avoid side effects and improve testability.

## 3. OpenRouter Integration

The OpenRouter integration will:

1. **Authentication & Setup**
   - Store API key securely using VS Code's secret storage
   - Provide configuration options for API endpoint and defaults
   - Support both global and workspace-specific settings

2. **Model Discovery & Selection**
   - Fetch available models from OpenRouter on extension activation
   - Cache models to reduce API calls
   - Provide a categorized model selection UI (by provider, size, capabilities)
   - Allow setting default models for different operations

3. **Request Handling**
   - Implement retry logic with exponential backoff
   - Support streaming responses for real-time feedback
   - Handle rate limiting and quota management
   - Provide fallback options for failed requests

4. **Response Processing**
   - Parse structured outputs (JSON, code blocks)
   - Support different response formats based on model capabilities
   - Handle errors and provide meaningful feedback to users

Implementation approach:
- Use axios or node-fetch for API communication
- Implement a caching layer for responses
- Create a request queue for managing concurrent operations
- Provide hooks for pre/post processing of requests and responses

## 4. Context Addition Feature

The context management system will:

1. **Context Capture**
   - Automatically extract relevant context from open files
   - Allow manual addition of context through commands
   - Support file/folder inclusion in context
   - Enable saving and loading of context presets

2. **Context Storage**
   - Maintain context across sessions
   - Implement efficient storage with size limitations
   - Use compression for large context windows
   - Provide context visualization and editing

3. **Context Relevance**
   - Implement relevance scoring for context items
   - Prioritize context based on recent interactions
   - Support context pruning to stay within model limits
   - Allow manual reordering of context importance

4. **Multi-File Context**
   - Extract dependencies between files
   - Build project-wide context understanding
   - Support different context strategies per language/project type
   - Integrate with VS Code's symbol providers

Implementation approach:
- Store context in memory for active session and persist to disk
- Use language servers when available to improve context quality
- Implement efficient context merging algorithms
- Provide user control over context window size and content

## 5. Agent-Based File Modification

The file modification service will:

1. **File Operations**
   - Read file contents safely
   - Apply changes with proper error handling
   - Support partial file modifications
   - Maintain undo history

2. **Operation Validation**
   - Verify permissions before modifications
   - Validate syntax after changes (when possible)
   - Prevent destructive operations without confirmation
   - Implement dry-run capability

3. **Multi-File Operations**
   - Support changes across multiple files
   - Handle dependencies between file changes
   - Implement atomic operations (all succeed or all fail)
   - Preview multi-file changes

4. **Integration with Source Control**
   - Respect .gitignore settings
   - Optionally create commits for changes
   - Support branch creation for experimental changes
   - Provide change history

Implementation approach:
- Use VS Code's workspace edit API for file modifications
- Implement a transaction-like system for multi-file changes
- Create a preview mechanism before applying changes
- Support rollback of failed operations

## 6. Testing Strategy

Following TDD principles, the testing strategy will:

1. **Test Structure**
   - Unit tests for isolated components
   - Integration tests for component interaction
   - End-to-end tests for complete workflows
   - Snapshot tests for UI components

2. **Testing Tools**
   - Vitest as the test runner
   - VS Code Extension Testing API for integration tests
   - MSW (Mock Service Worker) for API mocking
   - Test fixtures for consistent test data

3. **TDD Workflow**
   - Write failing tests first
   - Implement minimal code to pass tests
   - Refactor while keeping tests green
   - Document test coverage expectations

4. **Test Coverage**
   - Aim for high coverage of core services (>90%)
   - Focus on critical paths and edge cases
   - Include error handling scenarios
   - Test configuration variations

Example test implementation plan:
1. Create mock for OpenRouter API
2. Write tests for model fetching, selection, and response handling
3. Implement minimal OpenRouter service to pass tests
4. Write tests for context management
5. Implement context service to pass tests
6. Continue this pattern for all components

## 7. TypeScript Considerations and Challenges

1. **Type Safety**
   - Define comprehensive interfaces for all external APIs
   - Use discriminated unions for state management
   - Implement strict null checking
   - Leverage generics for reusable components

2. **Potential Challenges**
   - **API Type Definitions**: OpenRouter API might evolve, requiring updates
   - **WebView Communication**: Ensuring type safety between extension and WebView
   - **VS Code API Versioning**: Handling different VS Code API versions
   - **Testing TypeScript Code**: Ensuring proper mocking of typed dependencies

3. **Solutions and Approaches**
   - Generate types from OpenAPI specifications when available
   - Create shared type definitions between extension and WebView
   - Use conditional types for VS Code API version compatibility
   - Implement proper typing for test mocks and fixtures

4. **Performance Considerations**
   - Balance compile-time type checking with runtime performance
   - Optimize type definitions for large context objects
   - Use lazy loading for heavy components
   - Consider impact of type checking on extension startup time

The TypeScript implementation will follow these best practices:
- Use interfaces over types when representing objects
- Leverage union types for discriminated unions
- Implement proper error typing
- Document complex types thoroughly
- Use strict compiler options
</extension_plan>

This plan outlines a comprehensive approach to creating a VS Code extension that leverages OpenRouter for AI-assisted coding, with context management similar to Cursor and agent-based file modification capabilities. The architecture follows industry best practices with clear separation of concerns, and the development process will adhere to TDD principles using Vitest. The TypeScript implementation will ensure type safety throughout the application while addressing potential challenges related to external APIs and VS Code integration.