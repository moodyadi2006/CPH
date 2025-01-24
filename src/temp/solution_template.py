class Solution:
    def twoSum(self, nums, target):
        # Create a dictionary to store numbers and their corresponding indices
        number_map = {}

        # Loop through the array
        for i, num in enumerate(nums):
            # Calculate the difference between the target and the current number
            diff = target - num

            # Check if the difference already exists in the dictionary
            if diff in number_map:
                # If it exists, return the indices of the current number and the number that adds up to the target
                return [i, number_map[diff]]

            # If it doesn't exist, add the current number and its index to the dictionary
            number_map[num] = i
        
        # If no two numbers add up to the target, return None
        return None

# Test cases
if __name__ == "__main__":
    solution = Solution()
    # Test case 1
    print(solution.twoSum([2,7,11,15], 9))
    # Test case 2
    print(solution.twoSum([3,2,4], 6))
    # Test case 3
    print(solution.twoSum([3,3], 6))
