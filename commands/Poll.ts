import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { sendNotification } from '../lib/Messages';
import { IPollData, Poll } from '../definitions/PollProps';
import { generateUUID } from '../lib/GenerateUUID';
import { t } from '../i18n/translation';
import { PollModal } from '../modals/poll/PollModal';
import { createPollButtons, buildVoteDisplay } from '../lib/PollHelpers';
import { POLL_CONSTANTS } from '../definitions/PollConstants';

export class QuickPoll implements ISlashCommand {
	public command = 'agile-poll';
	public i18nParamsExample: string = 'quick_poll_examples';
	public i18nDescription: string = 'quick_poll_description';
	public providesPreview: boolean = false;

	public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
		const author = context.getSender();
		const user = await read.getUserReader().getAppUser();
		const room: IRoom = context.getRoom();

		const args = context.getArguments();

		if (args.length === 0) {
			const modal = await PollModal({
				modify,
				read,
				persistence: persis,
				http,
				slashCommandContext: context,
			});
			await modify.getUiController().openModalView(modal, { triggerId: context.getTriggerId() as string }, author);
			return;
		}

		if (args.length < 2) {
			await sendNotification(read, modify, author, room, t('please_provide_both_arguments'));
			return;
		}

		const isVoteLocked = args.includes('--lock');
		const isPublic = args.includes('--public');
		const filteredArgs = args.filter((arg) => arg !== '--lock' && arg !== '--public');

		const time = filteredArgs[0];
		const remainingText = filteredArgs.slice(1).join(' ');

		let pollQuestion: string;
		let options: string[];

		if (remainingText.includes('|')) {
			const textWithPlaceholder = remainingText.replace(/\\\|/g, POLL_CONSTANTS.ESCAPE_PLACEHOLDER);
			const rawParts = textWithPlaceholder.split('|').map((s) => s.replace(new RegExp(POLL_CONSTANTS.ESCAPE_PLACEHOLDER, 'g'), '|'));

			pollQuestion = rawParts[0].trim();

			options = rawParts.slice(1).map((s) => s.trim()).filter((s) => s.length > 0);

			if (options.length === 0) {
				options = ['Yes', 'No'];
			}
		} else {
			pollQuestion = remainingText;
			options = ['Yes', 'No'];
		}

		if (!pollQuestion || pollQuestion.trim().length === 0) {
			await sendNotification(read, modify, author, room, t('poll_empty_question'));
			return;
		}

		if (options.length > POLL_CONSTANTS.MAX_OPTIONS) {
			await sendNotification(read, modify, author, room, t('poll_max_options_exceeded').replace('${count}', String(options.length)));
			return;
		}
		if (remainingText.includes('|') && options.length < POLL_CONSTANTS.MIN_OPTIONS) {
			await sendNotification(read, modify, author, room, t('poll_min_options_required'));
			return;
		}

		for (const opt of options) {
			if (opt.length > POLL_CONSTANTS.MAX_OPTION_LENGTH) {
				await sendNotification(read, modify, author, room, t('poll_option_too_long').replace('${option}', opt.slice(0, 20) + '...'));
				return;
			}
		}

		const lowerCaseOptions = options.map((o) => o.toLowerCase());
		const duplicates = options.filter((opt, index) => lowerCaseOptions.indexOf(opt.toLowerCase()) !== index);
		if (duplicates.length > 0) {
			await sendNotification(read, modify, author, room, t('poll_duplicate_options').replace('${option}', duplicates[0]));
			return;
		}

		const timeInMinutes = parseInt(time, 10);
		if (isNaN(timeInMinutes) || timeInMinutes <= 0) {
			await sendNotification(read, modify, author, room, t('invalid_time_argument'));
			return;
		}

		if (timeInMinutes > POLL_CONSTANTS.MAX_TIME_MINUTES) {
			await sendNotification(read, modify, author, room, t('time_argument_too_large'));
			return;
		}

		const timeInSeconds = timeInMinutes * 60;

		const uuid = generateUUID();

		const responses: { [option: string]: string[] } = {};
		options.forEach((opt) => {
			responses[opt] = [];
		});

		const pollData: IPollData = {
			time,
			message: pollQuestion,
			uuid,
			roomId: room.id,
			creatorName: author.name,
			creatorId: author.id,
			pollMessage: pollQuestion,
			messageId: '',
			options,
			responses,
			isVoteLocked,
			lockedVoters: [],
			isPublic,
		};

		const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, uuid);
		await persis.createWithAssociation(pollData, assoc);

		const { optionButtons, cancelButton } = createPollButtons(options, uuid, isPublic);

		const builder = modify
			.getCreator()
			.startMessage()
			.setSender(user ?? author)
			.setRoom(room)
			.setBlocks([
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `## Poll has started ${isVoteLocked ? '🔒' : ''}\n**${pollData.pollMessage}**${isPublic ? '\n━━━━━━━━━━━━━━━━━\n' + buildVoteDisplay(options, responses, isPublic) : ''}\n_Created by: ${pollData.creatorName}${isVoteLocked ? ' • Votes locked_' : '_'}`,
					},
				},
				{
					type: 'actions',
					elements: [...optionButtons, cancelButton],
				},
			]);

		const messageId = await modify.getCreator().finish(builder);

		const when = new Date();
		when.setSeconds(when.getSeconds() + timeInSeconds);

		const job = {
			id: Poll.ProcessorId,
			when,
			data: { uuid },
		};

		const scheduledJobId = await modify.getScheduler().scheduleOnce(job);

		pollData.messageId = messageId;
		pollData.jobId = scheduledJobId || uuid;
		await persis.updateByAssociation(assoc, pollData);
	}
}
