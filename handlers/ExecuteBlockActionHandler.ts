import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { AgileBotApp } from '../AgileBotApp';
import { IUIKitResponse, UIKitBlockInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { sendNotification } from '../lib/Messages';
import { IPollData, Poll } from '../definitions/PollProps';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { t } from '../i18n/translation';
import { createPollButtons, buildVoteDisplay } from '../lib/PollHelpers';
import { saveVote, getUserVote, getVotesForPoll, removeAllVotesForPoll } from '../lib/PollVoteHelpers';

export class ExecuteBlockActionHandler {
	constructor(
		private readonly app: AgileBotApp,
		private readonly read: IRead,
		private readonly http: IHttp,
		private readonly modify: IModify,
		private readonly persistence: IPersistence,
	) { }

	public async run(context: UIKitBlockInteractionContext): Promise<IUIKitResponse> {
		const { actionId, user, value, room } = context.getInteractionData();

		if (!room || !value) {
			return {
				success: false,
			};
		}

		switch (actionId) {
			case Poll.PollVote:
				await this.handlePollVote(user, room, value);
				break;
			case Poll.PollYes:
				await this.handleLegacyVote(user, room, value, 'Yes');
				break;
			case Poll.PollNo:
				await this.handleLegacyVote(user, room, value, 'No');
				break;
			case Poll.PollCancel:
				await this.handlePollCancel(user, room, value);
				break;
		}

		return {
			success: true,
		};
	}

	private async handlePollVote(user: IUser, room: IRoom, value: string) {
		try {
			const { uuid, option } = JSON.parse(value);
			const responseStatus = await this.storePollResponse(uuid, option, user.name, user.id);
			let message: string;
			switch (responseStatus) {
				case 'success':
					message = t('poll_response_recorded').replace('${option}', option) || `Your vote for "${option}" has been recorded.`;
					break;
				case 'locked':
					message = t('poll_vote_already_locked');
					break;
				case 'ended':
				default:
					message = t('poll_already_ended');
					break;
			}
			await sendNotification(this.read, this.modify, user, room, message);
		} catch (e) {
			console.error('Error parsing vote value:', e);
			await sendNotification(this.read, this.modify, user, room, t('poll_already_ended'));
		}
	}

	private async handleLegacyVote(user: IUser, room: IRoom, uuid: string, option: string) {
		const responseStatus = await this.storePollResponse(uuid, option, user.name, user.id);
		let message: string;
		switch (responseStatus) {
			case 'success':
				message = option === 'Yes' ? t('poll_response_recorded_yes') : t('poll_response_recorded_no');
				break;
			case 'locked':
				message = t('poll_vote_already_locked');
				break;
			case 'ended':
			default:
				message = t('poll_already_ended');
				break;
		}
		await sendNotification(this.read, this.modify, user, room, message);
	}

	private async storePollResponse(uuid: string, option: string, userName: string, userId: string): Promise<'success' | 'locked' | 'ended'> {
		const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, uuid);
		const [pollData] = (await this.read.getPersistenceReader().readByAssociation(assoc)) as IPollData[];
		if (!pollData) {
			console.error(`Poll with ID ${uuid} not found`);
			return 'ended';
		}

		const existingVote = await getUserVote(this.read, uuid, userId);

		if (pollData.isVoteLocked && existingVote) {
			return 'locked';
		}

		await saveVote(this.persistence, uuid, userId, userName, option);

		if (pollData.isPublic && pollData.messageId) {
			await this.updatePollMessageWithLiveResults(pollData);
		}

		return 'success';
	}

	private async updatePollMessageWithLiveResults(pollData: IPollData): Promise<void> {
		const sender = await this.read.getUserReader().getAppUser();
		if (!sender) {
			return;
		}

		const lockIndicator = pollData.isVoteLocked ? '🔒' : '';

		const votes = await getVotesForPoll(this.read, pollData.uuid);

		const responses: { [key: string]: string[] } = {};
		for (const opt of pollData.options) {
			responses[opt] = votes[opt] || [];
		}

		const voteDisplay = buildVoteDisplay(pollData.options, responses, true);

		const { optionButtons, cancelButton } = createPollButtons(pollData.options, pollData.uuid, pollData.isPublic);

		const messageBuilder = await this.modify.getUpdater().message(pollData.messageId, sender);
		messageBuilder.setBlocks([
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `## Poll has started ${lockIndicator}\n**${pollData.pollMessage}**\n━━━━━━━━━━━━━━━━━\n${voteDisplay}\n_Created by: ${pollData.creatorName}${pollData.isVoteLocked ? ' • Votes locked_' : '_'}`,
				},
			},
			{
				type: 'actions',
				elements: [...optionButtons, cancelButton],
			},
		]);
		await this.modify.getUpdater().finish(messageBuilder);
	}

	private async handlePollCancel(user: IUser, room: IRoom, uuid: string) {
		const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, uuid);
		const [pollData] = (await this.read.getPersistenceReader().readByAssociation(assoc)) as IPollData[];

		if (!pollData) {
			await sendNotification(this.read, this.modify, user, room, t('poll_already_ended'));
			return;
		}

		if (pollData.creatorId !== user.id) {
			await sendNotification(this.read, this.modify, user, room, t('poll_cancel_not_creator'));
			return;
		}

		await this.persistence.removeByAssociation(assoc);

		await removeAllVotesForPoll(this.persistence, pollData.uuid);

		if (pollData.jobId) {
			try {
				await this.modify.getScheduler().cancelJob(pollData.jobId);
			} catch (e) {
				console.log(`Could not cancel job ${pollData.jobId}: ${e}`);
			}
		}

		const sender = await this.read.getUserReader().getAppUser();
		if (pollData.messageId && sender) {
			const messageBuilder = await this.modify.getUpdater().message(pollData.messageId, sender);
			messageBuilder.setBlocks([
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `## ⛔ Poll Cancelled\n**Question:** ~~${pollData.pollMessage}~~\n_Cancelled by: ${pollData.creatorName}_`,
					},
				},
			]);
			await this.modify.getUpdater().finish(messageBuilder);
		}

		await sendNotification(this.read, this.modify, user, room, t('poll_cancelled_successfully'));
	}
}
