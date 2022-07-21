const {
	cleanCodeBlockContent,
	EmbedBuilder,
} = require('discord.js');
const { diff: getDiff } = require('object-diffy');


const exists = thing => (typeof thing === 'string' && thing.length > 0) && (thing !== null && thing !== undefined);

const arrToObj = obj => {
	for (const key in obj) {
		if (obj[key] instanceof Array && obj[key][0]?.id) {
			const temp = {};
			obj[key].forEach(v => (temp[v.id] = v));
			obj[key] = temp;
		}
	}
	return obj;
};

function makeDiff({
	original, updated,
}) {
	const diff = getDiff(arrToObj(original), arrToObj(updated));
	const fields = [];
	for (const key in diff) {
		if (key === 'createdAt') continue; // object-diffy doesn't like dates
		const from = exists(diff[key].from) ? `- ${String(diff[key].from).replace(/\n/g, '\\n')}\n` : '';
		const to = exists(diff[key].to) ? `+ ${String(diff[key].to).replace(/\n/g, '\\n')}\n` : '';
		fields.push({
			inline: true,
			name: key,
			value: `\`\`\`diff\n${cleanCodeBlockContent(from + to)}\n\`\`\``,
		});
	}
	return fields;
}

/**
 * @param {import("client")} client
 * @param {string} guildId
 * @returns {import("discord.js").TextChannel?}
*/
async function getLogChannel(client, guildId) {
	const { logChannel: channelId } = await client.prisma.guild.findUnique({
		select: { logChannel: true },
		where: { id: guildId },
	});
	return channelId && client.channels.cache.get(channelId);
}

/**
 * @param {import("client")} client
 * @param {object} details
 * @param {string} details.guildId
 * @param {string} details.userId
 * @param {string} details.action
*/
async function logAdminEvent(client, {
	guildId, userId, action, target, diff,
}) {
	const user = await client.users.fetch(userId);
	client.log.info.settings(`${user.tag} ${action}d ${target.type} ${target.id}`);
	const settings = await client.prisma.guild.findUnique({
		select: {
			footer: true,
			locale: true,
			logChannel: true,
		},
		where: { id: guildId },
	});
	if (!settings.logChannel) return;
	const colour = action === 'create'
		? 'Green' : action === 'update'
			? 'Orange' : action === 'delete'
				? 'Red' : 'Default';
	const getMessage = client.i18n.getLocale(settings.locale);
	const i18nOptions = {
		user: `<@${user.id}>`,
		verb: getMessage(`log.admin.verb.${action}`),
	};
	const channel = client.channels.cache.get(settings.logChannel);
	if (!channel) return;
	const embeds = [
		new EmbedBuilder()
			.setColor(colour)
			.setAuthor({
				iconURL: user.avatarURL(),
				name: user.username,
			})
			.setTitle(getMessage('log.admin.title.joined', {
				...i18nOptions,
				targetType: getMessage(`log.admin.title.target.${target.type}`),
				verb: getMessage(`log.admin.verb.${action}`),
			}))
			.setDescription(getMessage('log.admin.description.joined', {
				...i18nOptions,
				targetType: getMessage(`log.admin.description.target.${target.type}`),
				verb: getMessage(`log.admin.verb.${action}`),
			}))
			.addFields([
				{
					name: getMessage(`log.admin.title.target.${target.type}`),
					value: target.name ?? target.id,
				},
			]),
	];

	if (diff && diff.original) {
		embeds.push(
			new EmbedBuilder()
				.setColor(colour)
				.setTitle(getMessage('log.admin.changes'))
				.setFields(makeDiff(diff)),
		);
	}

	return await channel.send({ embeds });
}

module.exports = {
	getLogChannel,
	logAdminEvent,
};