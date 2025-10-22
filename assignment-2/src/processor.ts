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
export async function main(args: string[]): Promise<void> {
  try {
    // 解析命令列參數
    const parsedArgs = parseCommandLineArgs(args)
    console.log('Parsed arguments:', parsedArgs)
    
    // 測試 JSON 檔案讀取
    const billInput = await readAndValidateJsonFile(parsedArgs.input)
    console.log('Successfully read and validated JSON file:', billInput.location)
    
    // TODO: 實作檔案處理和輸出邏輯
    console.log('JSON file processing completed!')
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

/**
 * 讀取並驗證 JSON 檔案
 * @param filePath 檔案路徑
 * @returns 驗證後的帳單輸入資料
 */
async function readAndValidateJsonFile(filePath: string): Promise<BillInput> {
  try {
    // 檢查檔案是否存在
    await fsPromises.access(filePath, fs.constants.F_OK)
    
    // 讀取檔案內容
    const fileContent = await fsPromises.readFile(filePath, 'utf-8')
    
    // 解析 JSON
    let jsonData: any
    try {
      jsonData = JSON.parse(fileContent)
    } catch (parseError) {
      throw new Error(`Invalid JSON format: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    }
    
    // 驗證 JSON 格式
    const validatedData = validateBillInput(jsonData)
    
    return validatedData
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`)
    } else if ((error as any).code === 'EACCES') {
      throw new Error(`Permission denied: ${filePath}`)
    } else {
      throw error
    }
  }
}

/**
 * 驗證帳單輸入資料格式
 * @param data 待驗證的資料
 * @returns 驗證後的帳單輸入資料
 */
function validateBillInput(data: any): BillInput {
  if (!data || typeof data !== 'object') {
    throw new Error('Input data must be an object')
  }
  
  // 驗證必要欄位
  if (!data.date || typeof data.date !== 'string') {
    throw new Error('Missing or invalid date field')
  }
  
  if (!data.location || typeof data.location !== 'string') {
    throw new Error('Missing or invalid location field')
  }
  
  if (typeof data.tipPercentage !== 'number' || data.tipPercentage < 0) {
    throw new Error('Missing or invalid tipPercentage field')
  }
  
  if (!Array.isArray(data.items)) {
    throw new Error('Missing or invalid items field (must be an array)')
  }
  
  // 驗證每個項目
  data.items.forEach((item: any, index: number) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Item ${index} must be an object`)
    }
    
    if (!item.name || typeof item.name !== 'string') {
      throw new Error(`Item ${index} missing or invalid name field`)
    }
    
    if (typeof item.price !== 'number' || item.price < 0) {
      throw new Error(`Item ${index} missing or invalid price field`)
    }
    
    if (typeof item.isShared !== 'boolean') {
      throw new Error(`Item ${index} missing or invalid isShared field`)
    }
    
    if (!item.isShared && (!item.person || typeof item.person !== 'string')) {
      throw new Error(`Item ${index} missing or invalid person field for personal item`)
    }
  })
  
  return data as BillInput
}
