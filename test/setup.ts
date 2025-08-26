// Global test setup
import { vi } from 'vitest'

// Mock console.error to avoid noise in tests unless explicitly testing logging
vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})