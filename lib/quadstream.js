var stream = require('stream');
var util = require('util');

function QuadStream()
{
	stream.Stream.call(this);
	this.error = null;
	this.writable = true;
	this.readable = true;
	this.symbols = {};

	this.id_counter = 0;
	this.contexts = [new Context('graph', this.create_id())];
	this.state = states[this.contexts[0].type]['start'];
	this.quads = [];
};
util.inherits(QuadStream, stream.Stream);


QuadStream.prototype.write = function(tokens)
{
	//console.log(symbol);
	//console.log(this.contexts);
	//console.log(this.state);
	for (var token_index = 0; token_index < tokens.length; token_index += 1)
	{
		var token = tokens[token_index];
		var desc = this.state[token.type];
		if (!desc) throw 'wrong token: ' + token.lexem;
		var next = desc.next;
		var cmds = desc.cmds;

		for (var index = 0; index < cmds.length; index += 1)
		{
			var cmd = cmds[index];
			if (cmd == '%lexem')
			{
				this.contexts.last().push_part(token.lexem);
			}
			else if (cmd == '%type')
			{
				this.contexts.last().type_is_required();
			}
			else if (cmd == '%language')
			{
				var part = this.contexts.last().parts.pop();
				this.contexts.last().parts.push(part + token.lexem);
			}
			else if (cmd == '%blank' || cmd == '%graph' || cmd == '%list')
			{
				var id;
				if (cmd != '%list')
				{
					id = this.create_id();
					this.symbols[id] = {lexem: id, type: 'qualified_name'};
				}
				else id = 'rdf:nil';

				var new_context = new Context(cmd.slice(1), this.contexts.last().graph, id);
				new_context.return = next;
				new_context.cmds = cmds;
				new_context.cmd_index = index;
				this.contexts.push(new_context);
				next = 'start';
				cmds = [];
			}
			else if (cmd == '%blank_end' || cmd == '%graph_end' || cmd == '%list_end')
			{
				var old_context = this.contexts.pop();
				if (this.contexts.length == 0) throw 'too many closing brackets/braces';
				this.contexts.last().push_part(old_context.id);
				next = old_context.return;
				cmds = old_context.cmds;
				index = old_context.cmd_index;
			}
			else if (cmd.slice(1, 6) == 'flush')
			{
				this.contexts.last().flush_parts(this, cmd.slice(6));
			}
			else if (cmd == '%reverse')
			{
				this.contexts.last().backward();
			}
			else this.contexts.last().push_part(cmd);
		}
		this.state = states[this.contexts.last().type][next];
	}
};

QuadStream.prototype.end = function()
{
	this.emit('end');
};

QuadStream.prototype.toString = function()
{
	return 'QuadStream';
};

QuadStream.prototype.create_id = function()
{
	this.id_counter += 1;
	return '_:id' + this.id_counter;	
}

var states =
{
	'graph':
	{
		'start':
		{
			'}': {next: '###', cmds: ['%graph_end']},
			'@base': {next: 'base_uri', cmds: ['%lexem']},
			'@prefix': {next: 'prefix', cmds: ['%lexem']},
			'uri': {next: 'predicate', cmds: ['%lexem']},
			'qualified_name': {next: 'predicate', cmds: ['%lexem']},
			'[': {next: 'start_predicate', cmds: ['%blank']},
			'{': {next: 'start_predicate', cmds: ['%graph']},
			'(': {next: 'start_predicate', cmds: ['%list']},
			'string': {next: 'tag_reverse', cmds: ['%lexem']},
			'number': {next: 'reverse', cmds: ['%lexem']},
		},
		'base_uri':
		{
			'uri': {next: '.', cmds: ['%lexem', '%flush2']},
		},
		'prefix':
		{
			'prefix': {next: 'prefix_uri', cmds: ['%lexem']},
		},
		'prefix_uri':
		{
			'uri': {next: '.', cmds: ['%lexem', '%flush3']},
		},
		'.':
		{
			'.': {next: 'start', cmds: []},
		},
		'predicate':
		{
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: ['%reverse']},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
		},
		'start_predicate':
		{
			'}': {next: '###', cmds: ['%graph_end']},
			'@base': {next: 'base_uri', cmds: ['%graph', '%lexem']},
			'@prefix': {next: 'prefix', cmds: ['%graph', '%lexem']},
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'predicate_object', cmds: ['%lexem']},
			'qualified_name': {next: 'predicate_object', cmds: ['%lexem']},
			'[': {next: 'start_predicate_object', cmds: ['%blank']},
			'{': {next: 'start_predicate_object', cmds: ['%graph']},
			'(': {next: 'start_predicate_object', cmds: ['%list']},
			'string': {next: 'tag_reverse', cmds: ['%lexem']},
			'number': {next: 'reverse', cmds: ['%lexem']},
		},
		'has_predicate':
		{
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
		},
		'reverse':
		{
			'is': {next: 'reversable', cmds: ['%reverse']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
		},
		'tag_reverse':
		{
			'^^': {next: 'type_reverse', cmds: ['%type']},
			'language': {next: 'reverse', cmds: ['%language']},
			'is': {next: 'reversable', cmds: ['%reverse']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
		},
		'type_reverse':
		{
			'uri': {next: 'reverse', cmds: ['%lexem']},
			'qualified_name': {next: 'reverse', cmds: ['%lexem']},
			'[': {next: 'reverse', cmds: ['%blank']},
			'{': {next: 'reverse', cmds: ['%graph']},
			'(': {next: 'reverse', cmds: ['%list']},
		},
		'reversable':
		{
			'uri': {next: 'of', cmds: ['%lexem']},
			'qualified_name': {next: 'of', cmds: ['%lexem']},
			'[': {next: 'of', cmds: ['%blank']},
			'{': {next: 'of', cmds: ['%graph']},
			'(': {next: 'of', cmds: ['%list']},
		},
		'of':
		{
			'of': {next: 'object', cmds: []},
		},
		'object':
		{
			'uri': {next: 'X', cmds: ['%lexem']},
			'qualified_name': {next: 'X', cmds: ['%lexem']},
			'[': {next: 'X', cmds: ['%blank']},
			'{': {next: 'X', cmds: ['%graph']},
			'(': {next: 'X', cmds: ['%list']},
			'string': {next: 'tag_X', cmds: ['%lexem']},
			'number': {next: 'X', cmds: ['%lexem']},
		},
		'predicate_object':
		{
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object_X', cmds: ['%lexem']},
			'qualified_name': {next: 'object_X', cmds: ['%lexem']},
			'[': {next: 'object_X', cmds: ['%blank']},
			'{': {next: 'object_X', cmds: ['%graph']},
			'(': {next: 'object_X', cmds: ['%list']},
			'string': {next: 'tag_X', cmds: ['%lexem']},
			'number': {next: 'X', cmds: ['%lexem']},
		},
		'object_X':
		{
			'uri': {next: 'X', cmds: ['%lexem']},
			'qualified_name': {next: 'X', cmds: ['%lexem']},
			'[': {next: 'X', cmds: ['%blank']},
			'{': {next: 'X', cmds: ['%graph']},
			'(': {next: 'X', cmds: ['%list']},
			'string': {next: 'tag_X', cmds: ['%lexem']},
			'number': {next: 'X', cmds: ['%lexem']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
		'start_predicate_object':
		{
			'}': {next: '###', cmds: ['%graph_end']},
			'@base': {next: 'base_uri', cmds: ['%lexem']},
			'@prefix': {next: 'prefix', cmds: ['%lexem']},
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'predicate_object_X', cmds: ['%lexem']},
			'qualified_name': {next: 'predicate_object_X', cmds: ['%lexem']},
			'[': {next: 'start_predicate_object_X', cmds: ['%blank']},
			'{': {next: 'start_predicate_object_X', cmds: ['%graph']},
			'(': {next: 'start_predicate_object_X', cmds: ['%list']},
			'string': {next: 'tag_predicate_X', cmds: ['%lexem']},
			'number': {next: 'predicate_X', cmds: ['%lexem']},
		},
		'tag_X':
		{
			'^^': {next: 'type_X', cmds: ['%type']},
			'language': {next: 'X', cmds: ['%language']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
		'type_X':
		{
			'uri': {next: 'X', cmds: ['%lexem']},
			'qualified_name': {next: 'X', cmds: ['%lexem']},
			'[': {next: 'X', cmds: ['%blank']},
			'{': {next: 'X', cmds: ['%graph']},
			'(': {next: 'X', cmds: ['%list']},
		},
		'tag_predicate_X':
		{
			'^^': {next: 'type_predicate_X', cmds: ['%type']},
			'language': {next: 'X', cmds: ['%language']},
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: ['%reverse']},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
		'type_predicate_X':
		{
			'uri': {next: 'predicate_X', cmds: ['%lexem']},
			'qualified_name': {next: 'predicate_X', cmds: ['%lexem']},
			'[': {next: 'predicate_X', cmds: ['%blank']},
			'{': {next: 'predicate_X', cmds: ['%graph']},
			'(': {next: 'predicate_X', cmds: ['%list']},
		},
		'predicate_X':
		{
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: ['%reverse']},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
		'X':
		{
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
		'predicate_object_X':
		{
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object_X', cmds: ['%lexem']},
			'qualified_name': {next: 'object_X', cmds: ['%lexem']},
			'[': {next: 'object_X', cmds: ['%blank']},
			'{': {next: 'object_X', cmds: ['%graph']},
			'(': {next: 'object_X', cmds: ['%list']},
			'string': {next: 'tag_X', cmds: ['%lexem']},
			'number': {next: 'X', cmds: ['%lexem']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
		'start_predicate_object_X':
		{
			'}': {next: '###', cmds: ['%graph_end']},
			'@base': {next: 'base_uri', cmds: ['%graph', '%lexem']},
			'@prefix': {next: 'prefix', cmds: ['%graph', '%lexem']},
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reversable', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'predicate_object_X', cmds: ['%lexem']},
			'qualified_name': {next: 'predicate_object_X', cmds: ['%lexem']},
			'[': {next: 'start_predicate_object_X', cmds: ['%blank']},
			'{': {next: 'start_predicate_object_X', cmds: ['%graph']},
			'(': {next: 'start_predicate_object_X', cmds: ['%list']},
			'string': {next: 'tag_predicate_X', cmds: ['%lexem']},
			'number': {next: 'predicate_X', cmds: ['%lexem']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			'.': {next: 'start', cmds: ['%flush3']},
			'}': {next: '###', cmds: ['%flush3', '%graph_end']},
		},
	},
	
	'blank':
	{
		'start':
		{
			']': {next: '###', cmds: ['%blank_end']},
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reverse', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
		},
		'predicate':
		{
			'has': {next: 'has_predicate', cmds: []},
			'is': {next: 'reverse', cmds: []},
			'a': {next: 'object', cmds: ['a']},
			'=': {next: 'object', cmds: ['=']},
			'=>': {next: 'object', cmds: ['=>']},
			'<=': {next: 'object', cmds: ['%reverse', '=>']},
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
		},
		'has_predicate':
		{
			'uri': {next: 'object', cmds: ['%lexem']},
			'qualified_name': {next: 'object', cmds: ['%lexem']},
			'[': {next: 'object', cmds: ['%blank']},
			'{': {next: 'object', cmds: ['%graph']},
			'(': {next: 'object', cmds: ['%list']},
		},
		'reverse':
		{
			'uri': {next: 'of', cmds: ['%reverse', '%lexem']},
			'qualified_name': {next: 'of', cmds: ['%reverse', '%lexem']},
			'[': {next: 'of', cmds: ['%reverse', '%blank']},
			'{': {next: 'of', cmds: ['%reverse', '%graph']},
			'(': {next: 'of', cmds: ['%list']},
		},
		'of':
		{
			'of': {next: 'object', cmds: []},
		},
		'object':
		{
			'uri': {next: 'X', cmds: ['%lexem']},
			'qualified_name': {next: 'X', cmds: ['%lexem']},
			'[': {next: 'X', cmds: ['%blank']},
			'{': {next: 'X', cmds: ['%graph']},
			'(': {next: 'X', cmds: ['%list']},
			'string': {next: 'tag_X', cmds: ['%lexem']},
			'number': {next: 'X', cmds: ['%lexem']},
		},
		'tag_X':
		{
			'^^': {next: 'type_X', cmds: ['%type']},
			'language': {next: 'X', cmds: ['%language']},
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			']': {next: '###', cmds: ['%flush3', '%blank_end']},
		},
		'type_X':
		{
			'uri': {next: 'X', cmds: ['%lexem']},
			'qualified_name': {next: 'X', cmds: ['%lexem']},
			'[': {next: 'X', cmds: ['%blank']},
			'{': {next: 'X', cmds: ['%graph']},
			'(': {next: 'X', cmds: ['%list']},
		},
		'X':
		{
			',': {next: 'object', cmds: ['%flush1']},
			';': {next: 'predicate', cmds: ['%flush2']},
			']': {next: '###', cmds: ['%flush3', '%blank_end']},
		},
	},
	'list':
	{
		'start':
		{
			')': {next: '###', cmds: ['%list_end']},
			'uri': {next: 'start', cmds: ['%lexem', '%flush']},
			'qualified_name': {next: 'start', cmds: ['%lexem', '%flush']},
			'[': {next: 'start', cmds: ['%blank', '%flush']},
			'{': {next: 'start', cmds: ['%graph', '%flush']},
			'(': {next: 'start', cmds: ['%list', '%flush']},
			'string': {next: 'tag_start', cmds: ['%lexem']},
			'number': {next: 'start', cmds: ['%lexem', '%flush']},
		},
		'tag_start':
		{
			'^^': {next: 'type_start', cmds: ['%type']},
			'language': {next: 'start', cmds: ['%language', '%flush']},
			')': {next: '###', cmds: ['%flush', '%list_end']},
			'uri': {next: 'start', cmds: ['%lexem', '%flush']},
			'qualified_name': {next: 'start', cmds: ['%lexem', '%flush']},
			'[': {next: 'start', cmds: ['%blank', '%flush']},
			'{': {next: 'start', cmds: ['%graph', '%flush']},
			'(': {next: 'start', cmds: ['%list', '%flush']},
			'string': {next: 'tag_start', cmds: ['%flush', '%lexem']},
			'number': {next: 'start', cmds: ['%lexem', '%flush']},
		},
		'type_start':
		{
			'uri': {next: 'start', cmds: ['%lexem', '%flush']},
			'qualified_name': {next: 'start', cmds: ['%lexem', '%flush']},
			'[': {next: 'start', cmds: ['%blank', '%flush']},
			'{': {next: 'start', cmds: ['%graph', '%flush']},
			'(': {next: 'start', cmds: ['%list', '%flush']},
		},
	},
};

function Context(type, graph, id, parts)
{
	this.type = type;
	this.graph = graph;
	this.id = id;
	this.parts = (parts) ? parts : [];
	this.max_parts_length = {'graph': 3, 'blank': 2, 'list': 1}[type];
	this.reverse = false;
	this.type_required = false;
}

Context.prototype.flush_parts = function(qs, cmd)
{
	if (this.type == 'list')
	{
		if (this.id == 'rdf:nil')
		{
			this.id = qs.create_id();
			this.list_id = this.id;
		}
		else
		{
			this.list_id = qs.create_id();
			this.rest_quad[3] = this.list_id;
		}
		qs.symbols[this.list_id] = {lexem: this.list_id, type: 'qualified_name'};

		qs.quads.push([this.graph, this.list_id, 'rdf:first', this.parts.pop()]);
		this.rest_quad = [this.graph, this.list_id, 'rdf:rest', 'rdf:nil'];
		qs.quads.push(this. rest_quad);

		return;
	}
	var quad = this.parts.slice();
	if (this.type == 'blank') quad.unshift(this.id);
	quad.unshift(this.graph);
	if (this.reverse)
	{
		var temp = quad[1];
		quad[1] = quad[3];
		quad[3] = temp;
	}
	qs.quads.push(quad);

	cmd = parseInt(cmd);
	this.parts = this.parts.slice(0, 3-cmd);
	if (cmd > 1) this.forward();
};

Context.prototype.push_part = function(part)
{
	if (this.type_required)
	{
		part = this.parts.pop() + '^^' + part;
		this.type_required = false;
	}
	this.parts.push(part);
	if (this.parts.length > this.max_parts_length) this.parts.shift();
};

Context.prototype.forward = function()
{
	this.reverse = false;
}

Context.prototype.backward = function()
{
	this.reverse = true;
}

Context.prototype.type_is_required = function()
{
	this.type_required = true;
}

Array.prototype.last = function()
{
	return this[this.length-1];
};


module.exports.QuadStream = QuadStream;