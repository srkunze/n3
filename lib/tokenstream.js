var events = require('events');
var util = require('util');

function TokenStream(debug_stream)
{
	events.EventEmitter.call(this);
	this.errorEmitted = false;
	this.writable = true;
	this.readable = true;

	this.buffer = '';
	this.buffers = [''];
	this.buffer_index = 0;

	if (debug_stream)
	{
		this.debug = true;
		this.on('debug', function(debug){ debug_stream.write('TokenStream: ' + debug + '\n'); });
	}
};
util.inherits(TokenStream, events.EventEmitter);

TokenStream.prototype.push_buffer = function(buffer)
{
	this.buffers.push(buffer);
	if (this.buffers.length > 3)
	{
		var shifted_buffer = this.buffers.shift();
		this.buffer_index -= shifted_buffer.length;
	}
	this.buffer = this.buffers.join('');
};

TokenStream.prototype.write = function(buffer)
{
	this.push_buffer(buffer);
	if (this.buffers.length < 3 && buffer) return;

	var max_index = this.buffers[0].length + this.buffers[1].length;
	var tokens = [];
	var token;
	while(this.buffer_index < max_index)
	{
		token = null;
		for(var index = 0; index < terminals.length; index += 1)
		{
			var terminal = terminals[index];
			var result = terminal.regex.exec(this.buffer.slice(this.buffer_index));
			if (!result) continue;
			var lexem = result[0];
			this.buffer_index += lexem.length;
			if (terminal.type == 'space' || terminal.type == 'comment') continue;
			token = {lexem: lexem, type: terminal.type};
			break;
		}
		if (!token) break;
		tokens.push(token);
	}
	if (this.debug) this.emit('debug', JSON.stringify(tokens));
	if (token == null && this.buffer_index < max_index)
	{
		this.writable = false;
		this.readable = false;
		this.emit('error', 'unexpected characters: ' + this.buffer.substr(this.buffer_index, 10));
		this.errorEmitted = true;
	}
	this.emit('data', tokens);
};

TokenStream.prototype.end = function(buffer)
{
	this.writable = false;
	this.write(buffer);
	this.readable = false;
	this.emit('end');
};

TokenStream.prototype.pipe = function(destination)
{
	this.on('data', function(symbol){ destination.write(symbol); });
	this.on('end', function(symbol){ destination.end(symbol); });
};

TokenStream.prototype.toString = function()
{
	return 'TokenStream';
};

var terminals = 
[
	{regex: /^\s+/,  type: 'space'},
	{regex: /^<=/,  type: '<='},
	{regex: /^<[^>]*>/,  type: 'uri'},
	{regex: /^(?:[A-Za-z_][\w_]*)?:[A-Za-z]\w*/,  type: 'qualified_name'},
	{regex: /^[A-Za-z]\w*:|^:/,  type: 'prefix'},
	{regex: /^"(?:[^"]|\\")*"/,  type: 'string'},
	{regex: /^[-+]?(?:\d+(\.\d+)?|\.\d+)/,  type: 'number'},
	{regex: /^\./,  type: '.'},
	{regex: /^\;/,  type: ';'},
	{regex: /^\,/,  type: ','},
	{regex: /^\^\^/,  type: '^^'},
	{regex: /^a/,  type: 'a'},
	{regex: /^\[/,  type: '['},
	{regex: /^\]/,  type: ']'},
	{regex: /^\(/,  type: '('},
	{regex: /^\)/,  type: ')'},
	{regex: /^\{/,  type: '{'},
	{regex: /^\}/,  type: '}'},
	{regex: /^is/,  type: 'is'},
	{regex: /^of/,  type: 'of'},
	{regex: /^=>/,  type: '=>'},
	{regex: /^=/,  type: '='},
	{regex: /^has/,  type: 'has'},
	{regex: /^\{/,  type: '{'},
	{regex: /^\}/,  type: '}'},
	{regex: /^@prefix/,  type: '@prefix'},
	{regex: /^@base/,  type: '@base'},
	{regex: /^@keyword/,  type: '@keyword'},
	{regex: /^@[a-z]+(?:-[a-z0-9]+)*/,  type: 'language'},
	{regex: /^#.*\n?/,  type: 'comment'},
];


module.exports.TokenStream = TokenStream;