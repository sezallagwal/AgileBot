import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { sendDirectMessage, sendMessage } from '../Messages';
import { IPollData, Poll } from '../../definitions/PollProps';
import { t } from '../../i18n/translation';
import { getVotesForPoll, removeAllVotesForPoll } from '../PollVoteHelpers';

export class QuickPollProcessor implements IProcessor {
	public id = Poll.ProcessorId;

	public async processor(jobContext: IJobContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence) {
		const { uuid } = jobContext;

		const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, uuid);
		const [pollData] = (await read.getPersistenceReader().readByAssociation(assoc)) as IPollData[];

		if (!pollData) {
			console.log(`Poll ${uuid} was cancelled or already processed, skipping results.`);
			return;
		}

		const room = await read.getRoomReader().getById(pollData.roomId);
		if (!room) {
			console.error(t('poll_with_room_not_found'));
			return;
		}

		const votes = await getVotesForPoll(read, uuid);

		let totalVotes = 0;
		const voteCounts: { [option: string]: number } = {};
		for (const option of pollData.options) {
			const count = votes[option]?.length || 0;
			voteCounts[option] = count;
			totalVotes += count;
		}

		let maxVotes = 0;
		let winners: string[] = [];
		for (const option of pollData.options) {
			if (voteCounts[option] > maxVotes) {
				maxVotes = voteCounts[option];
				winners = [option];
			} else if (voteCounts[option] === maxVotes) {
				winners.push(option);
			}
		}

		const summaryResult = winners.length > 1 ? 'TIE' : winners[0] || 'No votes';

		let resultsDisplay = '';
		for (const option of pollData.options) {
			const count = voteCounts[option];
			const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
			resultsDisplay += `• ${option}: ${count} (${percentage.toFixed(1)}%)\n`;
		}

		const channelSummaryText = `### 📋 Poll Results\n**Question:** ${pollData.pollMessage}\n_Created by: ${pollData.creatorName}_\n━━━━━━━━━━━━━━━━━\n${resultsDisplay}\n### Verdict: ${summaryResult}`;

		let detailedStatsDisplay = '';
		for (const option of pollData.options) {
			const count = voteCounts[option];
			const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
			const voters = votes[option]?.join(', ') || 'None';
			detailedStatsDisplay += `${option} (${percentage.toFixed(2)}%): ${voters}\n`;
		}

		const detailedStatsText = `
### Detailed Poll Results:
**${pollData.pollMessage}**

${detailedStatsDisplay}
        `;

		const sender = await read.getUserReader().getAppUser();
		if (!sender) {
			console.error(t('poll_app_user_not_found'));
			return;
		}

		await sendMessage(modify, room, sender, channelSummaryText);

		const creator = await read.getUserReader().getById(pollData.creatorId);
		if (creator) {
			await sendDirectMessage(read, modify, creator, detailedStatsText, persis);
		} else {
			console.error(t('poll_creator_with_username_not_found'));
		}

		await persis.removeByAssociation(assoc);
		await removeAllVotesForPoll(persis, uuid);
	}
}
