import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { UIKitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionContext';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { storeInteractionRoomData } from '../../lib/RoomInteraction';
import { Modals } from '../../definitions/ModalsEnum';
import { t } from '../../i18n/translation';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

export async function PollModal({
	modify,
	read,
	persistence,
	slashCommandContext,
	uiKitContext,
}: {
	modify: IModify;
	read: IRead;
	persistence: IPersistence;
	http: IHttp;
	slashCommandContext?: SlashCommandContext;
	uiKitContext?: UIKitInteractionContext;
}): Promise<IUIKitModalViewParam> {
	const app = (await read.getUserReader().getAppUser()) as IUser;
	const room = slashCommandContext?.getRoom() || uiKitContext?.getInteractionData().room;
	const user = slashCommandContext?.getSender() || uiKitContext?.getInteractionData().user;

	if (user?.id && room?.id) {
		await storeInteractionRoomData(persistence, user.id, room.id);
	}

	return {
		id: Modals.PollCreation,
		title: { type: 'plain_text', text: t('poll_modal_title') },
		submit: {
			type: 'button',
			text: { type: 'plain_text', text: t('poll_modal_create') },
			actionId: 'submit_poll_creation',
			blockId: 'poll_creation_submit',
			appId: app.id,
		},
		blocks: [
			{
				type: 'input',
				blockId: 'pollQuestion',
				label: {
					type: 'plain_text',
					text: t('poll_modal_question_label'),
				},
				element: {
					type: 'plain_text_input',
					appId: app.id,
					blockId: 'pollQuestion',
					actionId: 'pollQuestion',
					placeholder: {
						type: 'plain_text',
						text: t('poll_modal_question_placeholder'),
					},
					multiline: false,
				},
			},
			{
				type: 'input',
				blockId: 'pollDuration',
				label: {
					type: 'plain_text',
					text: t('poll_modal_duration_label'),
				},
				element: {
					type: 'plain_text_input',
					appId: app.id,
					blockId: 'pollDuration',
					actionId: 'pollDuration',
					placeholder: {
						type: 'plain_text',
						text: t('poll_modal_duration_placeholder'),
					},
					initialValue: '5',
				},
			},
			{
				type: 'input',
				blockId: 'pollOptions',
				optional: true,
				label: {
					type: 'plain_text',
					text: t('poll_modal_options_label'),
				},
				element: {
					type: 'plain_text_input',
					appId: app.id,
					blockId: 'pollOptions',
					actionId: 'pollOptions',
					placeholder: {
						type: 'plain_text',
						text: t('poll_modal_options_placeholder'),
					},
					multiline: true,
				},
			},
			{
				type: 'context',
				elements: [
					{
						type: 'mrkdwn',
						text: t('poll_modal_options_hint'),
					},
				],
			},
			{
				type: 'input',
				blockId: 'pollLockVotes',
				optional: true,
				label: {
					type: 'plain_text',
					text: t('poll_modal_lock_label'),
				},
				element: {
					type: 'static_select',
					appId: app.id,
					blockId: 'pollLockVotes',
					actionId: 'pollLockVotes',
					placeholder: {
						type: 'plain_text',
						text: 'Select',
					},
					initialOption: {
						text: { type: 'plain_text', text: 'No' },
						value: 'no',
					},
					options: [
						{
							text: { type: 'plain_text', text: 'No' },
							value: 'no',
						},
						{
							text: { type: 'plain_text', text: 'Yes' },
							value: 'yes',
						},
					],
				},
			},
			{
				type: 'input',
				blockId: 'pollShowResults',
				optional: true,
				label: {
					type: 'plain_text',
					text: t('poll_modal_public_label'),
				},
				element: {
					type: 'static_select',
					appId: app.id,
					blockId: 'pollShowResults',
					actionId: 'pollShowResults',
					placeholder: {
						type: 'plain_text',
						text: 'Select',
					},
					initialOption: {
						text: { type: 'plain_text', text: 'No' },
						value: 'no',
					},
					options: [
						{
							text: { type: 'plain_text', text: 'No' },
							value: 'no',
						},
						{
							text: { type: 'plain_text', text: 'Yes' },
							value: 'yes',
						},
					],
				},
			},
		],
	};
}
