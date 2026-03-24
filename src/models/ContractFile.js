'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ContractFile model — table: contract_files
// Stores file metadata for generated contract PDFs.
// ─────────────────────────────────────────────────────────────────────────────

const db                        = require('../db/supabaseClient');
const { toCamel, toSnake, toCamelList } = require('../db/mappers');

const TABLE = 'contract_files';

/**
 * @param {{
 *   contractId: string,
 *   spaId:      string,
 *   fileType?:  string,   // defaults to 'CONTRACT_PDF'
 *   fileName:   string,
 *   filePath:   string,
 *   fileSize?:  number,
 * }} fileData
 * @returns {object}
 */
async function create(fileData) {
  const { data, error } = await db
    .from(TABLE)
    .insert(toSnake(fileData))
    .select()
    .single();

  if (error) throw new Error(`ContractFile.create failed: ${error.message}`);
  return toCamel(data);
}

/**
 * @param {string} contractId  UUID
 * @returns {object[]}
 */
async function findByContractId(contractId) {
  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('contract_id', contractId)
    .order('generated_at', { ascending: false });

  if (error) throw new Error(`ContractFile.findByContractId failed: ${error.message}`);
  return toCamelList(data);
}

module.exports = { create, findByContractId };
