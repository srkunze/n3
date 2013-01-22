function QuadContext(type, graph, id, parts)
{
	this.type = type;
	this.graph = graph;
	this.id = id;
	this.parts = (parts) ? parts : [];
	this.max_parts_length = {'graph': 3, 'blank': 2, 'list': 1}[type];
	this.reverse = false;
	this.type_required = false;
}

QuadContext.prototype.flush_parts = function(qs, cmd)
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

QuadContext.prototype.push_part = function(part)
{
	if (this.type_required)
	{
		part = this.parts.pop() + '^^' + part;
		this.type_required = false;
	}
	this.parts.push(part);
	if (this.parts.length > this.max_parts_length) this.parts.shift();
};

QuadContext.prototype.forward = function()
{
	this.reverse = false;
};

QuadContext.prototype.backward = function()
{
	this.reverse = true;
};

QuadContext.prototype.type_is_required = function()
{
	this.type_required = true;
};


module.exports.createQuadContext = function(type, graph, id, parts)
{
	return new QuadContext(type, graph, id, parts);
}