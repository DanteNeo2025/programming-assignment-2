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
    console.log('🚀 Starting file processing...')
    console.log('📝 Parsed arguments:', parsedArgs)
    
    // 判斷是單一檔案還是批次處理
    const inputStats = await fsPromises.stat(parsedArgs.input).catch(error => {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`❌ Input path not found: ${parsedArgs.input}`)
      } else if ((error as any).code === 'EACCES') {
        throw new Error(`❌ Permission denied accessing: ${parsedArgs.input}`)
      } else {
        throw new Error(`❌ Failed to access input path: ${error.message}`)
      }
    })
    
    if (inputStats.isFile()) {
      // 單一檔案處理
      console.log('📄 Processing single file...')
      await processSingleFile(parsedArgs.input, parsedArgs.output, parsedArgs.format || 'json')
    } else if (inputStats.isDirectory()) {
      // 批次處理
      console.log('📁 Processing directory (batch mode)...')
      await processBatchFiles(parsedArgs.input, parsedArgs.output, parsedArgs.format || 'json')
    } else {
      throw new Error(`❌ Input path is neither a file nor a directory: ${parsedArgs.input}`)
    }
    
    console.log('✅ File processing completed successfully!')
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error))
    
    // 提供解決建議
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        console.error('💡 Suggestion: Please check if the input file or directory exists')
      } else if (error.message.includes('Permission denied')) {
        console.error('💡 Suggestion: Please check file permissions or run with appropriate privileges')
      } else if (error.message.includes('Invalid format')) {
        console.error('💡 Suggestion: Use --format=json or --format=text')
      } else if (error.message.includes('Missing required argument')) {
        console.error('💡 Suggestion: Use --input=<path> --output=<path> [--format=json|text]')
      }
    }
    
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
  
  // 過濾掉 node 和腳本路徑參數
  const relevantArgs = args.slice(2)
  
  if (relevantArgs.length === 0) {
    throw new Error('❌ Missing required arguments. Usage: --input=<path> --output=<path> [--format=json|text]')
  }
  
  for (const arg of relevantArgs) {
    if (arg.startsWith('--input=')) {
      result.input = arg.substring('--input='.length).trim()
      if (!result.input) {
        throw new Error('❌ Invalid --input argument: path cannot be empty')
      }
    } else if (arg.startsWith('--output=')) {
      result.output = arg.substring('--output='.length).trim()
      if (!result.output) {
        throw new Error('❌ Invalid --output argument: path cannot be empty')
      }
    } else if (arg.startsWith('--format=')) {
      const format = arg.substring('--format='.length).trim().toLowerCase()
      if (format === 'json' || format === 'text') {
        result.format = format
      } else {
        throw new Error(`❌ Invalid format: ${format}. Supported formats: json, text`)
      }
    } else if (arg.startsWith('--help') || arg === '-h') {
      console.log(`
📋 Usage: npx ts-node src/cli.ts --input=<path> --output=<path> [--format=json|text]

📄 Options:
  --input=<path>    Input file or directory path
  --output=<path>   Output file or directory path  
  --format=<type>   Output format: json (default) or text
  --help, -h        Show this help message

📋 Examples:
  # Single file processing (JSON output)
  npx ts-node src/cli.ts --input=data/bill.json --output=result.json
  
  # Single file processing (Text output)
  npx ts-node src/cli.ts --input=data/bill.json --output=result.txt --format=text
  
  # Batch processing
  npx ts-node src/cli.ts --input=data/bills/ --output=results/ --format=json
`)
      process.exit(0)
    } else {
      console.warn(`⚠️  Unknown argument: ${arg}`)
    }
  }
  
  // 驗證必要參數
  if (!result.input) {
    throw new Error('❌ Missing required argument: --input=<path>')
  }
  if (!result.output) {
    throw new Error('❌ Missing required argument: --output=<path>')
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
    console.log(`📝 Processing single file: ${inputPath}`)
    
    // 讀取並驗證 JSON 檔案
    const billInput = await readAndValidateJsonFile(inputPath)
    console.log(`📋 Successfully read and validated: ${billInput.location} (${billInput.items.length} items)`)
    
    // 使用核心函數處理分帳
    const billOutput = splitBill(billInput)
    console.log(`💰 Bill calculation completed for ${billOutput.items.length} people`)
    
    // 寫入輸出檔案
    await writeOutputFile(outputPath, billOutput, format)
    console.log(`✅ Successfully processed ${path.basename(inputPath)} -> ${path.basename(outputPath)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    // 如果已經是我們自訂的錯誤，直接拋出
    if (message.startsWith('❌')) {
      throw error
    }
    
    throw new Error(`❌ Failed to process file ${inputPath}: ${message}`)
  }
}

/**
 * 批次處理多個檔案
 * @param inputDir 輸入目錄路徑
 * @param outputDir 輸出目錄路徑
 * @param format 輸出格式
 */
async function processBatchFiles(inputDir: string, outputDir: string, format: OutputFormat): Promise<void> {
  try {
    console.log(`📁 Starting batch processing: ${inputDir} -> ${outputDir}`)
    
    // 檢查輸入目錄是否存在
    try {
      await fsPromises.access(inputDir, fs.constants.F_OK)
      const inputStat = await fsPromises.stat(inputDir)
      if (!inputStat.isDirectory()) {
        throw new Error(`❌ Input path is not a directory: ${inputDir}\n💡 Use a directory path for batch processing`)
      }
    } catch (accessError) {
      const err = accessError as any
      if (err.code === 'ENOENT') {
        throw new Error(`❌ Input directory not found: ${inputDir}\n💡 Make sure the directory path is correct`)
      }
      throw accessError
    }
    
    // 確保輸出目錄存在
    try {
      await fsPromises.mkdir(outputDir, { recursive: true })
    } catch (mkdirError) {
      const err = mkdirError as any
      if (err.code === 'EACCES') {
        throw new Error(`❌ Permission denied creating output directory: ${outputDir}\n💡 Check directory permissions or run with appropriate privileges`)
      }
      throw mkdirError
    }
    
    // 讀取輸入目錄中的所有檔案
    let files: string[]
    try {
      files = await fsPromises.readdir(inputDir)
    } catch (readdirError) {
      const err = readdirError as any
      if (err.code === 'EACCES') {
        throw new Error(`❌ Permission denied reading directory: ${inputDir}\n💡 Check directory permissions`)
      }
      throw new Error(`❌ Failed to read directory: ${inputDir}`)
    }
    
    // 過濾出 JSON 檔案
    const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json')
    
    if (jsonFiles.length === 0) {
      console.log(`⚠️  No JSON files found in input directory: ${inputDir}`)
      console.log(`💡 Make sure your directory contains .json files`)
      return
    }
    
    console.log(`📋 Found ${jsonFiles.length} JSON files to process:`)
    jsonFiles.forEach(file => console.log(`   - ${file}`))
    
    // 處理每個 JSON 檔案
    const results = await Promise.allSettled(
      jsonFiles.map(async (file) => {
        const inputPath = path.join(inputDir, file)
        const outputFileName = path.basename(file, '.json') + (format === 'json' ? '.json' : '.txt')
        const outputPath = path.join(outputDir, outputFileName)
        
        try {
          await processSingleFile(inputPath, outputPath, format)
          return { file, success: true, error: null }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { file, success: false, error: message }
        }
      })
    )
    
    // 報告處理結果
    const successful = results.filter(result => result.status === 'fulfilled' && result.value.success).length
    const failed = results.filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)).length
    
    console.log(`\n📊 Batch Processing Summary:`)
    console.log(`   Total files: ${jsonFiles.length}`)
    console.log(`   ✅ Successful: ${successful}`)
    console.log(`   ❌ Failed: ${failed}`)
    
    // 顯示失敗的檔案
    if (failed > 0) {
      console.log(`\n❌ Failed Files:`)
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`   • ${jsonFiles[index]}: ${result.reason}`)
        } else if (result.status === 'fulfilled' && !result.value.success) {
          console.error(`   • ${jsonFiles[index]}: ${result.value.error}`)
        }
      })
    }
    
    // 顯示成功的檔案
    if (successful > 0) {
      console.log(`\n✅ Successfully Processed Files:`)
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          console.log(`   • ${jsonFiles[index]}`)
        }
      })
    }
    
    if (failed > 0) {
      throw new Error(`❌ Batch processing completed with ${failed} failed files out of ${jsonFiles.length} total`)
    }
    
    console.log(`\n🎉 All ${successful} files processed successfully!`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    // 如果已經是我們自訂的錯誤，直接拋出
    if (message.startsWith('❌')) {
      throw error
    }
    
    throw new Error(`❌ Failed to process batch files: ${message}`)
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
    
    // 驗證檔案內容不為空
    if (!fileContent.trim()) {
      throw new Error(`❌ File is empty: ${filePath}`)
    }
    
    // 解析 JSON
    let jsonData: any
    try {
      jsonData = JSON.parse(fileContent)
    } catch (parseError) {
      throw new Error(`❌ Invalid JSON format in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}\n💡 Please check your JSON syntax (commas, brackets, quotes)`)
    }
    
    // 驗證 JSON 格式
    const validatedData = validateBillInput(jsonData, filePath)
    
    return validatedData
  } catch (error) {
    const err = error as any
    if (err.code === 'ENOENT') {
      throw new Error(`❌ File not found: ${filePath}\n💡 Make sure the file path is correct and the file exists`)
    } else if (err.code === 'EACCES') {
      throw new Error(`❌ Permission denied: ${filePath}\n💡 Check file permissions or run with appropriate privileges`)
    } else if (err.code === 'EISDIR') {
      throw new Error(`❌ Path is a directory, not a file: ${filePath}\n💡 Specify a JSON file path, not a directory`)
    }
    
    // 如果已經是我們自訂的錯誤，直接拋出
    if (error instanceof Error && error.message.startsWith('❌')) {
      throw error
    }
    
    // 其他未預期的錯誤
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`❌ Failed to read file ${filePath}: ${message}`)
  }
}

/**
 * 驗證帳單輸入資料格式
 * @param data 待驗證的資料
 * @param filePath 檔案路徑 (用於錯誤訊息)
 * @returns 驗證後的帳單輸入資料
 */
function validateBillInput(data: any, filePath = ''): BillInput {
  const fileInfo = filePath ? ` in ${filePath}` : ''
  
  if (!data || typeof data !== 'object') {
    throw new Error(`❌ Input data must be an object${fileInfo}\n💡 Make sure your JSON file contains a valid object`)
  }
  
  // 驗證必要欄位
  if (!data.date || typeof data.date !== 'string') {
    throw new Error(`❌ Missing or invalid 'date' field${fileInfo}\n💡 Add a 'date' field with a string value (e.g., "2024-01-01")`)
  }
  
  if (!data.location || typeof data.location !== 'string') {
    throw new Error(`❌ Missing or invalid 'location' field${fileInfo}\n💡 Add a 'location' field with a string value (e.g., "Restaurant Name")`)
  }
  
  if (typeof data.tipPercentage !== 'number' || data.tipPercentage < 0) {
    throw new Error(`❌ Missing or invalid 'tipPercentage' field${fileInfo}\n💡 Add a 'tipPercentage' field with a non-negative number (e.g., 15)`)
  }
  
  if (!Array.isArray(data.items)) {
    throw new Error(`❌ Missing or invalid 'items' field${fileInfo}\n💡 Add an 'items' field with an array of items`)
  }
  
  if (data.items.length === 0) {
    throw new Error(`❌ Items array cannot be empty${fileInfo}\n💡 Add at least one item to the 'items' array`)
  }
  
  // 驗證每個項目
  data.items.forEach((item: any, index: number) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`❌ Item ${index + 1} must be an object${fileInfo}\n💡 Each item should be a JSON object with name, price, and isShared fields`)
    }
    
    if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
      throw new Error(`❌ Item ${index + 1} missing or invalid 'name' field${fileInfo}\n💡 Each item must have a 'name' field with a non-empty string`)
    }
    
    if (typeof item.price !== 'number' || item.price < 0) {
      throw new Error(`❌ Item ${index + 1} missing or invalid 'price' field${fileInfo}\n💡 Each item must have a 'price' field with a non-negative number`)
    }
    
    if (typeof item.isShared !== 'boolean') {
      throw new Error(`❌ Item ${index + 1} missing or invalid 'isShared' field${fileInfo}\n💡 Each item must have an 'isShared' field with true or false`)
    }
    
    if (!item.isShared && (!item.person || typeof item.person !== 'string' || item.person.trim() === '')) {
      throw new Error(`❌ Item ${index + 1} missing or invalid 'person' field for personal item${fileInfo}\n💡 Personal items (isShared: false) must have a 'person' field with a non-empty string`)
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
    
    try {
      await fsPromises.mkdir(outputDir, { recursive: true })
    } catch (mkdirError) {
      const err = mkdirError as any
      if (err.code === 'EACCES') {
        throw new Error(`❌ Permission denied creating directory: ${outputDir}\n💡 Check directory permissions or run with appropriate privileges`)
      }
      throw mkdirError
    }
    
    let content: string
    
    try {
      if (format === 'json') {
        content = JSON.stringify(billOutput, null, 2)
      } else {
        content = formatTextOutput(billOutput)
      }
    } catch (formatError) {
      throw new Error(`❌ Failed to format output data: ${formatError instanceof Error ? formatError.message : String(formatError)}`)
    }
    
    await fsPromises.writeFile(outputPath, content, 'utf-8')
    console.log(`✅ Output written to ${outputPath} (${format} format)`)
  } catch (error) {
    const err = error as any
    if (err.code === 'EACCES') {
      throw new Error(`❌ Permission denied writing to: ${outputPath}\n💡 Check file permissions or run with appropriate privileges`)
    } else if (err.code === 'ENOSPC') {
      throw new Error(`❌ No space left on device: ${outputPath}\n💡 Free up disk space and try again`)
    } else if (err.code === 'EISDIR') {
      throw new Error(`❌ Output path is a directory, not a file: ${outputPath}\n💡 Specify a file path, not a directory`)
    }
    
    // 如果已經是我們自訂的錯誤，直接拋出
    if (error instanceof Error && error.message.startsWith('❌')) {
      throw error
    }
    
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`❌ Failed to write output file: ${message}`)
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
