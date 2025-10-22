import * as fs from 'fs' // sync version
import * as fsPromises from 'fs/promises' // async version (Promise-based fs API)
import * as path from 'path'
import { splitBill, BillInput, BillOutput } from './core'

// 定義命令列參數介面
interface CommandLineArgs {
  input: string
  output: string
  format?: 'json' | 'text'
}

/**
 * 主程式入口點
 * @param args 命令列參數陣列
 * @description 解析命令列參數並執行相應的處理邏輯，支援單一檔案和批次處理模式
 */
export function main(args: string[]): void {
  try {
    // 解析命令列參數
    const parsedArgs = parseCommandLineArgs(args)
    console.log('Parsed arguments:', parsedArgs)
    
    // TODO: 實作檔案處理邏輯
    console.log('Arguments parsed successfully!')
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/**
 * 解析命令列參數
 * @param args 命令列參數陣列
 * @returns 解析後的參數物件
 */
function parseCommandLineArgs(args: string[]): CommandLineArgs {
  const result: Partial<CommandLineArgs> = {}
  
  for (const arg of args) {
    if (arg.startsWith('--input=')) {
      result.input = arg.substring('--input='.length)
    } else if (arg.startsWith('--output=')) {
      result.output = arg.substring('--output='.length)
    } else if (arg.startsWith('--format=')) {
      const format = arg.substring('--format='.length)
      if (format === 'json' || format === 'text') {
        result.format = format
      } else {
        throw new Error(`Invalid format: ${format}. Supported formats: json, text`)
      }
    }
  }
  
  // 驗證必要參數
  if (!result.input) {
    throw new Error('Missing required argument: --input')
  }
  if (!result.output) {
    throw new Error('Missing required argument: --output')
  }
  
  return result as CommandLineArgs
}
