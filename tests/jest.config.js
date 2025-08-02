module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/test/**',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/setup.js'],
    testTimeout: 30000,
    projects: [
        {
            displayName: 'node',
            testEnvironment: 'node',
            testMatch: [
                '**/tests/api/**/*.test.js',
                '**/tests/database/**/*.test.js',
                '**/tests/ml/**/*.test.js',
                '**/tests/security/**/*.test.js',
                '**/tests/integration/**/*.test.js'
            ]
        },
        {
            displayName: 'jsdom',
            testEnvironment: 'jsdom',
            testMatch: [
                '**/tests/utils/**/*.test.js',
                '**/tests/mobile/**/*.test.js',
                '**/tests/chat/**/*.test.js',
                '**/tests/e2e/**/*.test.js'
            ],
            setupFilesAfterEnv: ['<rootDir>/setup.js']
        }
    ]
};
