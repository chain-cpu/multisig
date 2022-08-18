import { Buffer } from 'buffer'
import * as fs from 'fs'
import { program as cli } from 'commander'
import log from 'loglevel'
import { AnchorProvider, Program, Wallet, web3 } from '@project-serum/anchor'
import { Keypair } from '@solana/web3.js'
import { MultisigClient } from '@multisig/sdk'
import { version } from '../package.json'
import { clusterUrl } from './utils'

log.setLevel('info')

cli
  .version(version)
  .option<web3.Cluster>(
    '-e, --env <string>',
    'Solana cluster env name',
    c => c as web3.Cluster,
    'devnet',
  )
  .option(
    '-k, --keypair <file>',
    'Solana wallet location',
    `${process.env.HOME}/.config/solana/id.json`,
  )
  .option('-l, --log-level <string>', 'log level', (l: any) => {
    l && log.setLevel(l)
  })
  .parseOptions(process.argv)

const opts = cli.opts()

const anchorOpts = AnchorProvider.defaultOptions()
const connection = new web3.Connection(clusterUrl(opts.env), anchorOpts.commitment)
const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(opts.keypair).toString())))
const provider = new AnchorProvider(connection, new Wallet(payer), anchorOpts)

const client = new MultisigClient({
  program: new Program(MultisigClient.IDL, MultisigClient.programId, provider),
  wallet: provider.wallet,
})

cli.command('create-multisig')
  .description('Create new multisig')
  .requiredOption('--keys <keys>', 'Owner keys (separated by comma)')
  .requiredOption('-t, --threshold <number>', 'Minimum number of owner approvals needed to sign a transaction')
  .option('-k, --key <base58>', 'Multisig derived key (default auto-generated)')
  .action(async (opts: any) => {
    const owners = new Set(opts.keys.split(','))
    owners.add(client.wallet.publicKey.toBase58())

    const { transaction, key } = await client.createMultisig({
      owners: [...owners].map(k => new web3.PublicKey(k as string)),
      threshold: Number(opts.threshold),
      key: opts.key ?? null,
    })
    try {
      const sig = await provider.sendAndConfirm(transaction)
      log.info(`Key: ${key.toBase58()}`)
      log.info(`Signature: ${sig}`)
      log.info('OK')
    } catch (e) {
      log.info('Error')
      console.log(e)
    }
  })

cli.command('show-multisig')
  .argument('<key>', 'Multisig derived key')
  .action(async (key: string) => {
    const multisig = await client.getMultisig(key)
    console.log(JSON.stringify(multisig, null, 2))
  })

cli.command('show-owned-multisig')
  .description('Show all owned multisig accounts')
  .action(async () => {
    const list = await client.findMultisigByOwner(client.wallet.publicKey)
    log.info(JSON.stringify(list, null, 2))
  })

cli.command('delete-multisig')
  .argument('<key>', 'Multisig derived key')
  .action(() => {
    log.info('Unimplemented')
  })

cli.command('create-transaction')
  .argument('<file>', 'Instructions file')
  .requiredOption('-m, --multisig <key>', 'Multisig derived key')
  .option('-i, --index <number>', 'Custom transaction index')
  .action(async (file, opts: any) => {
    const [multisigKey] = await client.pda.multisig(opts.multisig)

    const instructions = Array.from(JSON.parse(fs.readFileSync(opts.keypair).toString()))
      .map((i: any) => new web3.TransactionInstruction(i))

    const { transaction, key } = await client.createTransaction({
      multisig: multisigKey,
      instructions,
      index: opts.index ?? null,
    })

    try {
      const sig = await provider.sendAndConfirm(transaction)
      log.info(`Key: ${key.toBase58()}`)
      log.info(`Signature: ${sig}`)
      log.info('OK')
    } catch (e) {
      log.info('Error')
      console.log(e)
    }
  })

cli.command('delete-transaction')
  .argument('<index>', 'Transaction index')
  .requiredOption('-m, --multisig <key>', 'Multisig derived key')
  .action(() => {
    log.info('Unimplemented')
  })

cli.command('approve')
  .argument('<index>', 'Transaction index')
  .requiredOption('-m, --multisig <key>', 'Multisig key')
  .action(async (index: string, opts: any) => {
    const [multisigKey] = await client.pda.multisig(opts.multisig)

    const { transaction } = await client.approveTransaction({
      multisig: multisigKey,
      index: Number(index),
    })

    try {
      const sig = await provider.sendAndConfirm(transaction)
      log.info(`Signature: ${sig}`)
      log.info('OK')
    } catch (e) {
      log.info('Error')
      console.log(e)
    }
  })

cli.command('approve-all')
  .requiredOption('-m, --multisig <key>', 'Multisig key')
  .action(async (opts: any) => {
    const [multisig] = await client.pda.multisig(opts.multisig)
    const transactions = await client.findTransactions({ multisig })

    log.info(`Found ${transactions.length} transaction(s)...`)

    let approved = 0
    for (const { account } of transactions) {
      if (!account.executedAt) {
        log.info(`Approving transaction #${account.index}...`)
        try {
          const { transaction } = await client.approveTransaction({
            multisig,
            index: Number(account.index),
          })
          const sig = await provider.sendAndConfirm(transaction)
          log.info(`Signature: ${sig}`)
          log.info('OK')
          approved++
        } catch (e) {
          log.info('Error')
          console.log(e)
        }
      }
    }

    if (transactions.length > 0) {
      log.info(`Total approved: ${approved}`)
    }
  })

cli.command('execute')
  .argument('<index>', 'Transaction index')
  .requiredOption('-m, --multisig <key>', 'Multisig key')
  .action(async (index: string, opts: any) => {
    const [multisig] = await client.pda.multisig(opts.multisig)

    const { transaction } = await client.executeTransaction({
      multisig,
      index: Number(index),
    })

    try {
      const sig = await provider.sendAndConfirm(transaction)
      log.info(`Signature: ${sig}`)
      log.info('OK')
    } catch (e) {
      log.info('Error')
      console.log(e)
    }
  })

cli.parse()