function getFileMetadata(file, chunkSize) {
	const size = file.size;
	const chunks = Math.ceil(size / chunkSize);

	return {
		size,
		chunks,
		type: file.type,
	};
}

function streamFile(file, chunkSize, callback) {
	const { size, chunks } = getFileMetadata(file, chunkSize);

	let offset = 0;
	let chunk = 0;

	const reader = new FileReader();

	reader.onload = () => {
		const data = reader.result;

		callback(data, chunk, offset);

		offset += chunkSize;
		chunk++;

		if (offset < size) {
			reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
		} else {
			callback(null, chunk, offset);
		}
	};

	reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));

	return true;
}
