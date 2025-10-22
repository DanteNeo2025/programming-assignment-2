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

// 定義輸出格式類型
type OutputFormat = 'json' | 'text'

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
    
    // 處理單一檔案
    await processSingleFile(parsedArgs.input, parsedArgs.output, parsedArgs.format || 'json')
    
    console.log('File processing completed successfully!')
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
 * 處理單一檔案
 * @param inputPath 輸入檔案路徑
 * @param outputPath 輸出檔案路徑
 * @param format 輸出格式
 */
async function processSingleFile(inputPath: string, outputPath: string, format: OutputFormat): Promise<void> {
  try {
    // 讀取並驗證 JSON 檔案
    const billInput = await readAndValidateJsonFile(inputPath)
    console.log('Successfully read and validated JSON file:', billInput.location)
    
    // 使用核心函數處理分帳
    const billOutput = splitBill(billInput)
    console.log('Bill calculation completed')
    
    // 寫入輸出檔案
    await writeOutputFile(outputPath, billOutput, format)
    console.log(`Successfully processed ${inputPath} -> ${outputPath}`)
  } catch (error) {
    throw new Error(`Failed to process file ${inputPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
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

/**
 * 寫入輸出檔案
 * @param outputPath 輸出檔案路徑
 * @param billOutput 帳單輸出資料
 * @param format 輸出格式
 */
async function writeOutputFile(outputPath: string, billOutput: BillOutput, format: OutputFormat): Promise<void> {
  try {
    // 確保輸出目錄存在
    const outputDir = path.dirname(outputPath)
    await fsPromises.mkdir(outputDir, { recursive: true })
    
    let content: string
    
    if (format === 'json') {
      content = JSON.stringify(billOutput, null, 2)
    } else {
      content = formatTextOutput(billOutput)
    }
    
    await fsPromises.writeFile(outputPath, content, 'utf-8')
    console.log(`Output written to ${outputPath} (${format} format)`)
  } catch (error) {
    if ((error as any).code === 'EACCES') {
      throw new Error(`Permission denied writing to: ${outputPath}`)
    } else {
      throw new Error(`Failed to write output file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * 格式化文字輸出
 * @param billOutput 帳單輸出資料
 * @returns 格式化的文字內容
 */
function formatTextOutput(billOutput: BillOutput): string {
  const lines: string[] = []
  
  lines.push('=== 聚餐分帳結果 ===')
  lines.push(`日期: ${billOutput.date}`)
  lines.push(`地點: ${billOutput.location}`)
  lines.push(`小計: $${billOutput.subTotal.toFixed(2)}`)
  lines.push(`小費: $${billOutput.tip.toFixed(2)}`)
  lines.push(`總計: $${billOutput.totalAmount.toFixed(2)}`)
  lines.push('')
  lines.push('=== 個人分帳 ===')
  
  billOutput.items.forEach(item => {
    lines.push(`${item.name}: $${item.amount.toFixed(2)}`)
  })
  
  return lines.join('\n')
}
