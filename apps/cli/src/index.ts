#!/usr/bin/env node
import { Command } from 'commander';
import { collectCommand } from './commands/collect.js';
import { exportCommand } from './commands/export.js';
import { serveCommand } from './commands/serve.js';
import { deleteCharacterCommand, deleteEventCommand, deleteReactionCommand } from './commands/delete.js';

const program = new Command()
  .configureHelp({ helpOption: ['-h, --help', '显示帮助信息'] });

program
  .name('shentan')
  .description('神探 - AI驱动的角色事迹自动收集系统')
  .version('0.1.0');

program
  .command('collect <name>')
  .description('收集指定角色的生平事迹和各方反应')
  .option('-t, --type <type>', '角色类型: historical(历史人物) 或 fictional(虚构角色)', 'historical')
  .option('-s, --source <source>', '角色来源，逗号分隔多个（如"哈利波特系列,神奇动物"）')
  .option('-r, --rounds <rounds>', '事件拓展最大轮次（动态收敛，实际可能更少）', '5')
  .option('-a, --aliases <aliases>', '用户自定义别名，逗号分隔（如 "川普,Trump,川建国"）')
  .option('--db <path>', '数据库文件路径')
  .action(collectCommand);

program
  .command('export <name-or-id>')
  .description('导出角色数据为 JSON 或 Markdown')
  .option('-f, --format <format>', '导出格式: json 或 markdown', 'json')
  .option('-o, --output <dir>', '输出目录', './output')
  .option('--db <path>', '数据库文件路径')
  .action(exportCommand);

program
  .command('serve')
  .description('启动 Web 可视化界面')
  .option('-p, --port <port>', '端口号', '3000')
  .action(serveCommand);

const deleteCmd = program
  .command('delete')
  .description('删除已收集的数据');

deleteCmd
  .command('character <name-or-id>')
  .description('删除角色及其所有事件和反应')
  .option('--db <path>', '数据库文件路径')
  .option('-f, --force', '跳过确认提示')
  .action(deleteCharacterCommand);

deleteCmd
  .command('event <id>')
  .description('删除事件及其所有反应')
  .option('--db <path>', '数据库文件路径')
  .option('-f, --force', '跳过确认提示')
  .action(deleteEventCommand);

deleteCmd
  .command('reaction <id>')
  .description('删除单条反应')
  .option('--db <path>', '数据库文件路径')
  .option('-f, --force', '跳过确认提示')
  .action(deleteReactionCommand);

program.parse();
