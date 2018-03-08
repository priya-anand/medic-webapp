const config = require('../../config'),
      mp_parser = require('./mp_parser'),
      javarosa_parser = require('./javarosa_parser'),
      textforms_parser = require('./textforms_parser');

const MUVUKU_REGEX = /^\s*([A-Za-z]?\d)!.+!.+/;

const T_TABLE = {
  /* Devanagari */ '०':'0', '१':'1', '२':'2', '३':'3', '४':'4', '५':'5', '६':'6', '७':'7', '८':'8', '९':'9',
};

// TODO ensure everything in here is still needed
const digitReplacer = c => T_TABLE[c];
const standardiseDigits = original => {
  return original && original.toString().replace(/[०-९]/g, digitReplacer);
};

/**
 * Determine if a message is using the Muvuku format.
 *
 * @param {String} msg sms message
 * @returns {Boolean} The parsed message code string or undefined
 * @api private
 */
const isMuvukuFormat = exports.isMuvukuFormat = msg => {
  return (typeof msg === 'string') && msg.match(MUVUKU_REGEX);
};

/*
 * Escape regex characters, helps to prevent injection issues when accepting
 * user input.
 */
const regexEscape = s => {
  if (typeof s !== 'string') {
    return s;
  }
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

/*
 * Remove the form code from the beginning of the message since it does
 * not belong to the TextForms format but is just a convention to
 * identify the message.
 */
const stripFormCode = (code, msg) => {
  if (typeof code !== 'string') {
    return msg;
  }
  return msg.replace(new RegExp(`^\\s*${regexEscape(code)}[\\s!\\-,:#]*`,'i'), '');
};

/**
 * Get parser based on code, the first part of a Muvuku header, which helps us
 * know how to parse the data.
 *
 * @param {Object} def - form definition
 * @param {Object} doc - sms_message document
 * @returns {Function|undefined} The parser function or undefined
 * @api private
 */
const getParser = exports.getParser = (def, doc) => {
  const code = def && def.meta && def.meta.code;
  let msg = doc.message;
  if (typeof msg !== 'string') {
    return;
  }
  const match = msg.match(MUVUKU_REGEX);
  if (match && match[1]) {
    switch(match[1].toUpperCase()) {
      case '1':
        return mp_parser.parse;
      case 'J1':
        return javarosa_parser.parse;
      default:
        return;
    }
  }
  msg = stripFormCode(code, msg);
  if (textforms_parser.isCompact(def, msg, doc.locale)) {
    return textforms_parser.parseCompact;
  } else {
    return textforms_parser.parse;
  }
};

/**
 * Uses the keys to create a deep key on the obj.
 * Assigns the val to the key in the obj.
 * If key already exists, only assign value.
 *
 * @param {Object} obj - object in which value is assigned to key
 * @param {Array} keys - keys in dot notation (e.g. ['some','thing','else'])
 * @param {String} val - value to be assigned to the generated key
 */
const createDeepKey = (obj, keys, val) => {
  if (keys.length === 0) {
    return;
  }

  const key = keys.shift();
  if (keys.length === 0) {
    obj[key] = val;
    return;
  }

  if(!obj[key]) {
    obj[key] = {};
  }
  createDeepKey(obj[key], keys, val);
};

const parseNum = raw => {
  if (raw === void 0) {
    return;
  }
  const std = standardiseDigits(raw);
  if (!isFinite(std) || std === '') {
    return null;
  }
  return Number(std);
};

const lower = str => str && str.toLowerCase ? str.toLowerCase() : str;

exports.parseField = (field, raw) => {
  switch (field.type) {
    case 'integer':
      // keep months integers, not their list value.
      if (field.validations && field.validations.is_numeric_month === true) {
        return parseNum(raw);
      }
      // store list value since it has more meaning.
      // TODO we don't have locale data inside this function so calling
      // translate does not resolve locale.
      if (field.list) {
        for (let i of field.list) {
          const item = field.list[i];
          if (String(item[0]) === String(raw)) {
            return config.translate(item[1]);
          }
        }
        console.warn(`Option not available for ${JSON.stringify(raw)} in list.`);
      }
      return parseNum(raw);
    case 'string':
      if (raw === undefined) {
        return;
      }
      if (raw === '') {
        return null;
      }
      // store list value since it has more meaning.
      // TODO we don't have locale data inside this function so calling
      // translate does not resolve locale.
      if (field.list) {
        for (let i of field.list) {
          const item = field.list[i];
          if (item[0] === raw) {
            return config.translate(item[1]);
          }
        }
        console.warn(`Option not available for ${raw} in list.`);
      }
      return config.translate(raw);
    case 'date':
      if (!raw) { return null; }
      // YYYY-MM-DD assume muvuku format for now
      // store in milliseconds since Epoch
      return new Date(raw).valueOf();
    case 'boolean':
      if (raw === undefined) {
        return;
      }
      const val = parseNum(raw);
      if (val === 1) {
        return true;
      }
      if (val === 0) {
        return false;
      }
      // if we can't parse a number then return null
      return null;
    case 'month':
      // keep months integers, not their list value.
      return parseNum(raw);
    default:
      console.warn('Unknown field type: ' + field.type);
      return raw;
  }
};

/**
 * @param {Object} def - form definition
 * @param {Object} doc - sms_message document
 * @returns {Object|{}} - A parsed object of the sms message or an empty
 * object if parsing fails. Currently supports textforms and muvuku formatted
 * messages.
 *
 * @api public
 */
exports.parse = (def, doc) => {

  let msg_data,
      parser,
      form_data = {},
      addOmittedFields = false;

  if (!def || !doc || !doc.message || !def.fields) {
    return {};
  }

  parser = getParser(def, doc);

  if (!parser) {
    console.error('Failed to find message parser.');
    return {};
  }

  if (isMuvukuFormat(doc.message)) {
    msg_data = parser(def, doc);
    addOmittedFields = true;
  } else {
    const code = def && def.meta && def.meta.code,
          msg = stripFormCode(code, doc.message || doc);
    if (textforms_parser.isCompact(def, msg, doc.locale)) {
      msg_data = parser(def, msg);
    } else {
      msg_data = parser(msg);

      // replace tiny labels with field keys for textforms
      for (let j of def.fields) {
        const label = lower(config.translate(def.fields[j].labels.tiny, doc.locale));
        if (j !== label && msg_data[label]) {
          msg_data[j] = msg_data[label];
          msg_data[label] = undefined;
        }
      }
    }
  }

  // parse field types and resolve dot notation keys
  for (let k of Object.keys(def.fields)) {
    if (msg_data[k] || addOmittedFields) {
      const value = exports.parseField(def.fields[k], msg_data[k]);
      createDeepKey(form_data, k.split('.'), value);
    }
  }

  // pass along some system generated fields
  if (msg_data._extra_fields === true) {
    form_data._extra_fields = true;
  }

  return form_data;
};

/**
 * @param {Object} def - forms form definition
 * @param {Object} doc - sms_message document
 * @returns {Array|[]} - An array of values from the raw sms message
 * @api public
 */
exports.parseArray = (def, doc) => {

  const parser = getParser(def, doc),
        obj = parser(def, doc);

  if (!def || !def.fields) { return []; }

  // collect field keys into array
  const arr = [];
  for (let k of def.fields) {
    arr.push(obj[k]);
  }

  // The fields sent_timestamp and from are set by the gateway, so they are
  // not included in the raw sms message and added manually.
  arr.unshift(doc.from);
  arr.unshift(doc.sent_timestamp);

  return arr;
};

/**
 * Determine form code through message headers, currently supporting muvuku and
 * textforms message formats.
 *
 * @param {String} msg - sms message
 * @returns {String} uppercased form code or undefined if we can't parse it
 * @api public
 */
exports.getFormCode = msg => {

  if (typeof msg !== 'string') {
    return;
  }

  // muvuku
  if (msg.split('!').length >= 3) {
    return msg.split('!')[1].toUpperCase();
  }
  // textforms
  const match = msg.match(/^\s*([^\s!\-,:#]+)[\s!\-,:#]*.*/);
  if (match !== null && match.length === 2) {
    return match[1].toUpperCase();
  }

};

/**
 * Merge fields from the form definition with the form data received through
 * the SMS into a data record. Always use the key property on the form
 * definition to define the data record.
 *
 * @param {String} form         - form id
 * @param {Array}  key          - key of the field separated by '.'
 * @param {Object} data_record  - record into which the data is merged
 * @param {Object} form_data    - data from the SMS
 *                                to be merged into the data record
 * @api public
 */
exports.merge = (form, key, data_record, form_data) => {
  // support creating subobjects on the record if form defines key with dot
  // notation.
  if(key.length > 1) {
    const tmp = key.shift();
    if(form_data[tmp]) {
      if(!data_record[tmp]) {
        data_record[tmp] = {};
      }
      exports.merge(form, key, data_record[tmp], form_data[tmp]);
    }
  } else {
    data_record[key[0]] = form_data[key[0]];
  }
};

