export interface IPollData {
	time: string;
	message: string;
	uuid: string;
	roomId: string;
	messageId: string;
	pollMessage: string;
	creatorId: string;
	creatorName: string;
	options: string[];
	responses: { [option: string]: string[] };
	jobId?: string;
	isVoteLocked?: boolean;
	lockedVoters?: string[];
	isPublic?: boolean;
}

export enum Poll {
	PollYes = 'quickpoll_yes',
	PollNo = 'quickpoll_no',
	PollVote = 'quickpoll_vote',
	PollCancel = 'quickpoll_cancel',
	PollRefresh = 'quickpoll_refresh',
	ProcessorId = 'quick_poll',
}

